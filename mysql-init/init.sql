CREATE DATABASE IF NOT EXISTS fixed_assets;
USE fixed_assets;

CREATE TABLE IF NOT EXISTS facode2sn (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facode VARCHAR(50) NOT NULL UNIQUE,
    sn VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 查询日志表：记录每次SN查询的详细信息
CREATE TABLE IF NOT EXISTS query_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sn VARCHAR(100) NOT NULL,
    facode VARCHAR(50) NOT NULL,
    query_ip VARCHAR(45) NOT NULL,
    city VARCHAR(100),
    device_type VARCHAR(50),
    user_agent TEXT,
    batch_id VARCHAR(64) NOT NULL COMMENT '查询批次ID，同一批次多次查询共享',
    queried_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sn (sn),
    INDEX idx_batch_id (batch_id),
    INDEX idx_queried_at (queried_at)
);

-- 风险规则表：配置风险检测规则
CREATE TABLE IF NOT EXISTS risk_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rule_code VARCHAR(50) NOT NULL UNIQUE,
    rule_name VARCHAR(100) NOT NULL,
    rule_description TEXT NOT NULL,
    rule_type ENUM('city_mismatch', 'device_mismatch', 'frequency_exceed') NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    config_json JSON COMMENT '规则参数配置，如时间窗口、频次阈值等',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 风险标记表：标记可疑的SN查询
CREATE TABLE IF NOT EXISTS risk_markers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sn VARCHAR(100) NOT NULL,
    risk_level ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    risk_reason TEXT COMMENT '触发的风险规则描述（仅管理员可见）',
    triggered_rules JSON COMMENT '触发的规则代码列表',
    status ENUM('pending', 'confirmed_fraud', 'confirmed_safe', 'ignored') DEFAULT 'pending',
    marked_by VARCHAR(50),
    marked_at TIMESTAMP NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sn (sn),
    INDEX idx_status (status)
);

-- 锁定批次表：确认冒用后锁定相关查询批次
CREATE TABLE IF NOT EXISTS locked_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(64) NOT NULL UNIQUE,
    sn VARCHAR(100) NOT NULL,
    risk_marker_id INT NOT NULL,
    lock_reason TEXT,
    locked_by VARCHAR(50) NOT NULL,
    is_locked TINYINT(1) DEFAULT 1,
    unlocked_by VARCHAR(50),
    unlocked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (risk_marker_id) REFERENCES risk_markers(id) ON DELETE CASCADE,
    INDEX idx_sn (sn),
    INDEX idx_batch_id (batch_id),
    INDEX idx_is_locked (is_locked)
);

-- 插入测试数据
INSERT INTO facode2sn (facode, sn) VALUES 
('FA001', 'SN2024001'),
('FA002', 'SN2024002'),
('FA003', 'SN2024003'),
('TEST-01', 'SN-TEST-001');

-- 插入风险规则
INSERT INTO risk_rules (rule_code, rule_name, rule_description, rule_type, config_json) VALUES 
('city_mismatch', '跨城市查询', '同一序列号在不同城市被查询', 'city_mismatch', '{"sensitivity": "high"}'),
('device_mismatch', '跨设备类型查询', '同一序列号在不同类型设备上被查询', 'device_mismatch', '{"sensitivity": "medium"}'),
('frequency_exceed', '高频查询', '同一序列号短时间内被多次查询', 'frequency_exceed', '{"time_window_minutes": 30, "max_queries": 5}');

-- 创建 api 用户 (适配用户测试场景)
CREATE USER IF NOT EXISTS 'api'@'%' IDENTIFIED BY 'FJzzCT#api';
GRANT SELECT, INSERT, UPDATE ON fixed_assets.* TO 'api'@'%';
FLUSH PRIVILEGES;
