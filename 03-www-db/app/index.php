<style>
  pre { background: #ddd; margin: 10vmin; min-height: 50vmin; border: 1px dotted #888; padding: 2em; }
</style>
<pre>
<?php
function show(string $name, callable $get): void {
    try {
        $v = $get();
        print " ... $name version " . htmlspecialchars((string)$v) . "\n";
    } catch (Throwable $e) {
        print " ... $name ERROR: " . htmlspecialchars($e->getMessage()) . "\n";
    }
}

show('mysql', function () {
    $c = new mysqli('db-mysql', 'root', 'secret');
    return $c->server_info;
});
show('pgsql', function () {
    $c = @pg_connect('host=db-pgsql user=postgres password=secret connect_timeout=5');
    if (!$c) throw new Exception('cannot connect');
    return pg_version($c)['server'];
});
show('redis', function () {
    $c = new Redis(['host' => 'db-redis']);
    return $c->info('server')['redis_version'];
});
?>
</pre>
