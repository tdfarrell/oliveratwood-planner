<?php
/*
 * Oliver Atwood Planner: save script.
 *
 * Keeps one file per project in ./data/, plus rolling backups in ./data/backups/.
 * Everything here is behind the password whose hash is in config.php (written by
 * the deploy workflow from the PLANNER_PASSWORD secret).
 *
 * Data files end in .php and start with an exit line, so even if the folder's
 * .htaccess were ignored, requesting one directly shows nothing.
 */

declare(strict_types=1);

const GUARD = "<?php http_response_code(404); exit; ?>\n";
const KEEP_RECENT = 40;   // most recent saves kept per project
const KEEP_DAYS = 120;    // plus the first save of each day, this many days back
const SESSION_DAYS = 90;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD = 12 * 1024 * 1024;
const COOKIE = 'planner_auth';

$DATA = getenv('PLANNER_DATA_DIR') ?: __DIR__ . '/data';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

function out($body, int $code = 200): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code, string $kind = 'error'): void { out(['error' => $msg, 'kind' => $kind], $code); }

// Users from config.php: [ 'users' => [ 'name' => ['hash' => …, 'label' => …, 'owner' => bool] ] ].
// The owner's projects stay in data/ (where they always were); everyone else
// gets their own folder at data/u/<name>/.
function users_config(): array {
    $file = __DIR__ . '/config.php';
    if (!is_file($file)) return [];
    $cfg = include $file;
    if (!is_array($cfg)) return [];
    if (!empty($cfg['users']) && is_array($cfg['users'])) {
        $out = [];
        foreach ($cfg['users'] as $name => $u) {
            if (!empty($u['hash'])) $out[strtolower((string)$name)] = $u + ['label' => $name, 'owner' => false];
        }
        return $out;
    }
    if (!empty($cfg['password_hash'])) return ['oliver' => ['hash' => $cfg['password_hash'], 'label' => 'Oliver', 'owner' => true]];
    return [];
}
function user_dir(string $DATA, string $name, array $u): string {
    return !empty($u['owner']) ? $DATA : "$DATA/u/$name";
}

function ensure_dirs(string $DATA): void {
    foreach ([$DATA, "$DATA/projects", "$DATA/backups"] as $d) {
        if (!is_dir($d) && !@mkdir($d, 0750, true)) fail('The planner can’t create its data folder on the server.', 500);
    }
    $ht = "$DATA/.htaccess";
    if (!is_file($ht)) {
        file_put_contents($ht, "Require all denied\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\nOptions -Indexes\n");
    }
    if (!is_file("$DATA/index.html")) file_put_contents("$DATA/index.html", '');
}

function read_guarded(string $file): ?string {
    $raw = @file_get_contents($file);
    if ($raw === false) return null;
    return str_starts_with($raw, GUARD) ? substr($raw, strlen(GUARD)) : $raw;
}
function write_atomic(string $file, string $content): void {
    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    if (file_put_contents($tmp, GUARD . $content, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        fail('The server couldn’t save the file.', 500);
    }
}

// ---------- Sign-in ----------

function secret(string $DATA): string {
    $file = "$DATA/secret.php";
    $s = read_guarded($file);
    if ($s === null || strlen(trim($s)) < 32) {
        $s = bin2hex(random_bytes(32));
        write_atomic($file, $s);
    }
    return trim($s);
}
function sign(string $DATA, string $hash, string $payload): string {
    return hash_hmac('sha256', $payload, secret($DATA) . '|' . $hash);
}
// Returns the signed-in user's name, or null.
function authed(string $DATA, array $users): ?string {
    $c = $_COOKIE[COOKIE] ?? '';
    if (!preg_match('/^(\d{10})\.([a-z0-9_-]{1,40})\.([a-f0-9]{64})$/', $c, $m)) return null;
    if ((int)$m[1] < time() || empty($users[$m[2]])) return null;
    return hash_equals(sign($DATA, $users[$m[2]]['hash'], $m[1] . '|' . $m[2]), $m[3]) ? $m[2] : null;
}
function set_cookie(string $value, int $expires): void {
    $path = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/') . '/';
    setcookie(COOKIE, $value, [
        'expires' => $expires, 'path' => $path, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true, 'samesite' => 'Strict',
    ]);
}

// Slows down password guessing: 8 wrong tries locks sign-in for 15 minutes.
function throttle(string $DATA, bool $failed = false): void {
    $file = "$DATA/attempts.php";
    $list = json_decode(read_guarded($file) ?? '[]', true) ?: [];
    $now = time();
    $list = array_values(array_filter($list, fn($t) => $t > $now - 900));
    if ($failed) { $list[] = $now; write_atomic($file, json_encode($list)); }
    elseif (count($list) >= 8) fail('Too many wrong passwords. Try again in 15 minutes.', 429, 'locked');
}

// ---------- Projects ----------

function slug_ok(?string $s): string {
    if (!is_string($s) || !preg_match('/^[a-z0-9][a-z0-9-]{0,59}$/', $s)) fail('Bad project name.', 400);
    return $s;
}
function rev_of(string $json): string { return substr(hash('sha256', $json), 0, 16); }
function project_file(string $DATA, string $slug): string { return "$DATA/projects/$slug.php"; }

function backup(string $DATA, string $slug, string $json): void {
    $dir = "$DATA/backups/$slug";
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $name = gmdate('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 3);
    write_atomic("$dir/$name.php", $json);
    // Prune: keep the newest KEEP_RECENT, plus the first of each day for KEEP_DAYS.
    $files = glob("$dir/*.php") ?: [];
    rsort($files);
    $keepDays = [];
    $cutoff = gmdate('Ymd', time() - KEEP_DAYS * 86400);
    foreach ($files as $i => $f) {
        if ($i < KEEP_RECENT) continue;
        $day = substr(basename($f), 0, 8);
        // files are newest-first, so the last one seen for a day is its first save
        $keepDays[$day] = $f;
    }
    $daily = array_flip(array_values(array_filter($keepDays, fn($f, $d) => $d >= $cutoff, ARRAY_FILTER_USE_BOTH)));
    foreach ($files as $i => $f) {
        if ($i >= KEEP_RECENT && !isset($daily[$f])) @unlink($f);
    }
}

function series_counts(array $d): array {
    if (($d['kind'] ?? '') === 'series') {
        $books = $d['books'] ?? [];
        $cards = 0;
        foreach ($books as $b) $cards += count($b['cards'] ?? []);
        return ['books' => count($books), 'cards' => $cards, 'entities' => count($d['entities'] ?? []), 'columns' => 0];
    }
    return ['cards' => count($d['cards'] ?? []), 'entities' => count($d['entities'] ?? []), 'columns' => count($d['columns'] ?? [])];
}

function body_json(): array {
    $raw = file_get_contents('php://input', false, null, 0, MAX_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BYTES) fail('That project is too large to save (8 MB limit).', 413);
    $b = json_decode($raw, true);
    if (!is_array($b)) fail('Bad request.', 400);
    return $b;
}

// ---------- Routing ----------

$users = users_config();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET' && ($_SERVER['HTTP_X_PLANNER'] ?? '') !== '1') fail('Bad request.', 400);

if ($action === 'status') {
    $who = $users && is_dir($DATA) ? authed($DATA, $users) : null;
    out(['configured' => (bool)$users, 'authed' => (bool)$who, 'user' => $who ? $users[$who]['label'] : null]);
}

if (!$users) fail('The planner password hasn’t been set yet. Add the PLANNER_PASSWORD secret in GitHub and run the deploy again.', 503, 'unconfigured');
ensure_dirs($DATA);

if ($action === 'login' && $method === 'POST') {
    throttle($DATA);
    $b = body_json();
    $name = strtolower(trim((string)($b['username'] ?? '')));
    $pass = (string)($b['password'] ?? '');
    // With only one user, the name can be left blank.
    if ($name === '' && count($users) === 1) $name = array_key_first($users);
    $u = $users[$name] ?? null;
    if (!$u || !password_verify($pass, $u['hash'])) {
        throttle($DATA, true);
        usleep(400000);
        fail('That name and password don’t match.', 401, 'auth');
    }
    $exp = time() + SESSION_DAYS * 86400;
    set_cookie($exp . '.' . $name . '.' . sign($DATA, $u['hash'], $exp . '|' . $name), $exp);
    out(['ok' => true, 'user' => $u['label']]);
}

if ($action === 'logout' && $method === 'POST') { set_cookie('', time() - 3600); out(['ok' => true]); }

$who = authed($DATA, $users);
if (!$who) fail('Please sign in.', 401, 'auth');
// From here on, $DATA is the signed-in user's own folder.
$DATA = user_dir($DATA, $who, $users[$who]);
foreach ([$DATA, "$DATA/projects", "$DATA/backups"] as $d) {
    if (!is_dir($d) && !@mkdir($d, 0750, true)) fail('The planner can’t create your data folder on the server.', 500);
}

switch ($action) {
    case 'list':
        $items = [];
        foreach (glob("$DATA/projects/*.php") ?: [] as $f) {
            $json = read_guarded($f);
            if ($json === null) continue;
            $d = json_decode($json, true) ?: [];
            $items[] = [
                'slug' => basename($f, '.php'), 'rev' => rev_of($json),
                'title' => $d['title'] ?? basename($f, '.php'), 'synopsis' => $d['synopsis'] ?? '',
                'updated' => gmdate('c', filemtime($f)),
                'kind' => ($d['kind'] ?? 'project') === 'series' ? 'series' : 'project',
                'counts' => series_counts($d),
            ];
        }
        usort($items, fn($a, $b) => strcmp($b['updated'], $a['updated']));
        out(['projects' => $items]);

    case 'read':
        $slug = slug_ok($_GET['slug'] ?? null);
        $json = read_guarded(project_file($DATA, $slug));
        if ($json === null) fail('That project doesn’t exist.', 404, 'missing');
        out(['data' => json_decode($json, true), 'rev' => rev_of($json)]);

    case 'write':
        if ($method !== 'POST') fail('Bad request.', 405);
        $slug = slug_ok($_GET['slug'] ?? null);
        $b = body_json();
        if (!isset($b['data']) || !is_array($b['data'])) fail('Bad request.', 400);
        $file = project_file($DATA, $slug);
        $lock = fopen("$DATA/projects/.lock", 'c');
        flock($lock, LOCK_EX);
        $current = read_guarded($file);
        $base = $b['rev'] ?? null;
        if ($current !== null && $base !== rev_of($current)) {
            fail('This project was changed somewhere else since you opened it.', 409, 'conflict');
        }
        if ($current === null && $base !== null) fail('This project was deleted somewhere else.', 409, 'conflict');
        $json = json_encode($b['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if ($current !== null) backup($DATA, $slug, $current);
        write_atomic($file, $json);
        flock($lock, LOCK_UN);
        out(['rev' => rev_of($json)]);

    case 'delete':
        if ($method !== 'POST') fail('Bad request.', 405);
        $slug = slug_ok($_GET['slug'] ?? null);
        $file = project_file($DATA, $slug);
        $current = read_guarded($file);
        if ($current === null) out(['ok' => true]);
        backup($DATA, $slug, $current);   // a deleted project can still be restored from backups
        @unlink($file);
        out(['ok' => true]);

    case 'backups':
        $slug = slug_ok($_GET['slug'] ?? null);
        $list = [];
        foreach (glob("$DATA/backups/$slug/*.php") ?: [] as $f) {
            $id = basename($f, '.php');
            $t = DateTime::createFromFormat('Ymd-His', substr($id, 0, 15), new DateTimeZone('UTC'));
            $list[] = ['id' => $id, 'at' => $t ? $t->format('c') : null, 'size' => filesize($f)];
        }
        usort($list, fn($a, $b) => strcmp($b['id'], $a['id']));
        out(['backups' => $list]);

    case 'backup':
        $slug = slug_ok($_GET['slug'] ?? null);
        $id = $_GET['id'] ?? '';
        if (!preg_match('/^\d{8}-\d{6}-[a-f0-9]{3}$/', $id)) fail('Bad request.', 400);
        $json = read_guarded("$DATA/backups/$slug/$id.php");
        if ($json === null) fail('That backup doesn’t exist.', 404, 'missing');
        out(['data' => json_decode($json, true)]);

    case 'upload':
        // Images for maps, mood boards and clippings. Stored by content hash, so
        // the same picture uploaded twice is kept once.
        if ($method !== 'POST') fail('Bad request.', 405);
        $raw = file_get_contents('php://input', false, null, 0, MAX_UPLOAD + 1);
        if ($raw === false || $raw === '') fail('Nothing was uploaded.', 400);
        if (strlen($raw) > MAX_UPLOAD) fail('That image is too large (12 MB limit).', 413);
        $info = @getimagesizefromstring($raw);
        $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/webp' => 'webp'][$info['mime'] ?? ''] ?? null;
        if (!$info || !$ext) fail('Only PNG, JPEG, GIF and WebP images can be uploaded.', 415);
        $dir = "$DATA/files";
        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) fail('The planner can’t create its image folder on the server.', 500);
        $name = substr(hash('sha256', $raw), 0, 20) . '.' . $ext;
        if (!is_file("$dir/$name") && file_put_contents("$dir/$name", $raw, LOCK_EX) === false) fail('The server couldn’t save the image.', 500);
        out(['name' => $name, 'w' => $info[0], 'h' => $info[1]]);

    case 'file':
        $n = $_GET['n'] ?? '';
        if (!preg_match('/^[a-f0-9]{20}\.(png|jpg|gif|webp)$/', $n, $m)) fail('Bad request.', 400);
        $f = "$DATA/files/$n";
        if (!is_file($f)) fail('That image isn’t on the server.', 404, 'missing');
        header('Content-Type: ' . ['png' => 'image/png', 'jpg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp'][$m[1]]);
        header('Cache-Control: private, max-age=31536000, immutable');
        header('Content-Length: ' . filesize($f));
        readfile($f);
        exit;

    case 'ideas':
        // The idea inbox: one list per person, shared by every project.
        $file = "$DATA/ideas.php";
        $current = read_guarded($file);
        if ($method === 'GET') {
            $d = $current === null ? ['ideas' => []] : (json_decode($current, true) ?: ['ideas' => []]);
            out(['ideas' => $d['ideas'] ?? [], 'rev' => $current === null ? null : rev_of($current)]);
        }
        $b = body_json();
        if (!isset($b['ideas']) || !is_array($b['ideas'])) fail('Bad request.', 400);
        if (($b['rev'] ?? null) !== ($current === null ? null : rev_of($current))) fail('The inbox changed on another device.', 409, 'conflict');
        $json = json_encode(['ideas' => $b['ideas']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        write_atomic($file, $json);
        out(['rev' => rev_of($json)]);

    case 'links':
        // Connections between series: one list per person, like the idea inbox.
        $file = "$DATA/links.php";
        $current = read_guarded($file);
        if ($method === 'GET') {
            $d = $current === null ? ['links' => []] : (json_decode($current, true) ?: ['links' => []]);
            out(['links' => $d['links'] ?? [], 'rev' => $current === null ? null : rev_of($current)]);
        }
        $b = body_json();
        if (!isset($b['links']) || !is_array($b['links'])) fail('Bad request.', 400);
        if (($b['rev'] ?? null) !== ($current === null ? null : rev_of($current))) fail('Connections changed on another device.', 409, 'conflict');
        $json = json_encode(['links' => $b['links']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        write_atomic($file, $json);
        out(['rev' => rev_of($json)]);

    case 'deleted':
        // Projects that only exist as backups (deleted), so they can be brought back.
        $out = [];
        foreach (glob("$DATA/backups/*", GLOB_ONLYDIR) ?: [] as $d) {
            $slug = basename($d);
            if (is_file(project_file($DATA, $slug))) continue;
            $files = glob("$d/*.php") ?: [];
            if (!$files) continue;
            rsort($files);
            $d0 = json_decode(read_guarded($files[0]) ?? '{}', true) ?: [];
            $out[] = ['slug' => $slug, 'title' => $d0['title'] ?? $slug, 'backup' => basename($files[0], '.php')];
        }
        out(['projects' => $out]);
}

fail('Unknown request.', 404);
