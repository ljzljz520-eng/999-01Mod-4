<?php

class Database
{
    // 默认连接参数（从环境变量获取）
    private $defaultHost;
    private $defaultPort;
    private $defaultName;
    private $defaultUser;
    private $defaultPass;

    public function __construct()
    {
        $this->defaultHost = getenv('DB_HOST') ?: 'db';
        $this->defaultPort = getenv('DB_PORT') ?: '3306';
        $this->defaultName = getenv('DB_NAME') ?: 'fixed_assets';
        $this->defaultUser = getenv('DB_USER') ?: 'root';
        $this->defaultPass = getenv('DB_PASSWORD') ?: 'root';
    }

    public function connect()
    {
        // 1. 优先检查 HTTP Headers 中的自定义配置 (X-DB-CONNECTION: mysql)
        $headers = array_change_key_case(getallheaders(), CASE_UPPER);

        $host = isset($headers['X-DB-HOST']) ? $headers['X-DB-HOST'] : $this->defaultHost;
        $port = isset($headers['X-DB-PORT']) ? $headers['X-DB-PORT'] : $this->defaultPort;
        $dbname = isset($headers['X-DB-NAME']) ? $headers['X-DB-NAME'] : $this->defaultName;
        $user = isset($headers['X-DB-USER']) ? $headers['X-DB-USER'] : $this->defaultUser;
        $password = isset($headers['X-DB-PASSWORD']) ? $headers['X-DB-PASSWORD'] : $this->defaultPass;

        // 如果 Header 指定了 mysql 但没有提供参数，也回退到默认值
        // 这里逻辑简化为：始终是 MySQL。如有 Header 则用 Header，否则用默认Env。

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4";

        try {
            $pdo = new PDO($dsn, $user, $password);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            return $pdo;
        } catch (PDOException $e) {
            // 安全起见，生产环境不应直接抛出详细连接错误，但开发工具可以
            throw new Exception("数据库连接失败: " . $e->getMessage());
        }
    }
}
