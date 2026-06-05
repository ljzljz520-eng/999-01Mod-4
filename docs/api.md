# FAQuery API 文档

## 1. 固定资产查询接口

根据固定资产编码 (FACode) 查询对应的序列号 (SN)。

### 端点信息
- **URL**: `/api/query.php`
- **Method**: `GET` 或 `POST`
- **Content-Type**: `application/json`

### 请求参数

| 参数名 | 类型 | 必选 | 说明 | 示例 |
|:-------|:-----|:-----|:-----|:-----|
| `facode` | string | 是 | 固定资产编码 | `FA001` |

### 响应结构

响应总是返回 JSON 格式。

#### 成功响应 (HTTP 200)

**场景 1：找到数据**
```json
{
  "success": true,
  "data": {
    "facode": "FA001",
    "sn": "SN2024001"
  }
}
```

**场景 2：未找到数据**
```json
{
  "success": true,
  "data": null
}
```

#### 错误响应 (HTTP 400)

**场景：缺少参数**
```json
{
  "success": false,
  "error": "缺少 facode 参数"
}
```

### CURL 调用示例

```bash
# GET 请求
curl "http://localhost:8080/api/query.php?facode=FA001"

# POST 请求
curl -X POST "http://localhost:8080/api/query.php" -d "facode=FA001"
```
