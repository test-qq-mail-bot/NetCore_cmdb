# API 文档：CMDB 插件

> 全部接口前缀 `/api/cmdb`，均需 `Authorization: Bearer <token>` 鉴权。
> 资产相关写操作自动记录审计日志。

---

## 目录

- [仪表盘](#仪表盘)
- [资产管理](#资产管理)
- [端口管理](#端口管理)
- [机柜管理](#机柜管理)
- [维保管理](#维保管理)
- [报表导出](#报表导出)
- [数据备份](#数据备份)
- [错误码](#错误码)
- [调用示例](#调用示例)

---

## 仪表盘

### GET `/api/cmdb/dashboard`

返回资产统计指标。

**响应**

```json
{
  "total_assets": 13,
  "it_assets": 10,
  "rack_count": 5,
  "total_value": 580499.00,
  "used_u": 18,
  "total_u": 192,
  "expiring_count": 2
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| total_assets | int | 资产总数（不含机柜） |
| it_assets | int | IT 设备数 |
| rack_count | int | 机柜总数 |
| total_value | float | 资产原值合计 |
| used_u | int | 已占用 U 数 |
| total_u | int | 机柜总 U 数 |
| expiring_count | int | 即将过保（≤30天）资产数 |

---

## 资产管理

### GET `/api/cmdb/assets`

分页列表查询。

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| page | int | 否 | 1 | 页码（≥1） |
| size | int | 否 | 20 | 每页条数（1-200，超过返回 422） |
| search | string | 否 | - | 关键字搜索（匹配名称/编号/使用人/部门/位置/SN/颜色/存储/内存） |
| category | string | 否 | - | 按分类筛选（如 IT设备） |
| exclude_category | string | 否 | - | 排除指定分类 |
| sort_by | string | 否 | id | 排序字段（id/asset_no/name/category/subtype/brand/color/user/status/warranty_expire/inventory_time/location/rack_id/sn/dept/storage/memory/purchase_date/created_at） |
| sort_order | string | 否 | desc | 排序方向（asc/desc） |
| filter_col | string | 否 | - | 筛选字段名（需配合 filter_values） |
| filter_values | string[] | 否 | - | 筛选值数组（多选） |

**响应**

```json
{
  "assets": [
    {
      "id": 1,
      "asset_no": "IT-20230601-01",
      "name": "Dell PowerEdge R750",
      "category": "IT设备",
      "subtype": "服务器",
      "user": "管理员",
      "dept": "IT部",
      "location": "A栋数据中心",
      "status": "使用中",
      "brand": "戴尔",
      "model": "R750",
      "sn": "DL-8821XY",
      "price": 68500.0,
      "warranty_expire": "2026-05-31",
      "rack_id": "CAB-A02",
      "u_start": 12,
      "u_height": 2,
      "is_network_device": false,
      "config": { "system_info": [...] },
      "ports": [...],
      "inventory_time": "2026-05-20",
      "created_at": "2026-08-26 10:00:00",
      "updated_at": "2026-08-26 10:00:00"
    }
  ],
  "total": 13
}
```

**说明**
- 前端 IT/实物资产页采用全量拉取：按 `total` 循环翻页取回（每页 200，上限 10000 条），客户端筛选/排序/分页。
- `is_network_device` 为 true 时，前端展示端口信息区。

---

### POST `/api/cmdb/assets`

新增资产。

**请求体**

```json
{
  "name": "核心交换机-01",
  "asset_no": "",
  "category": "IT设备",
  "subtype": "交换机",
  "user": "网络管理员",
  "dept": "IT部",
  "location": "A栋数据中心",
  "status": "使用中",
  "brand": "华为",
  "model": "CE6857",
  "sn": "HW-001",
  "color": "黑色",
  "storage": "128GB SSD",
  "memory": "16GB",
  "contract_no": "HT-2024-001",
  "supplier": "华为技术",
  "purchase_date": "2024-03-01",
  "price": 152000,
  "warranty_expire": "2027-02-28",
  "note": "核心交换机",
  "rack_id": "CAB-A02",
  "u_start": 24,
  "u_height": 1,
  "is_network_device": true,
  "config": { "system_info": [...] },
  "ports": [...],
  "inventory_time": "2026-04-15"
}
```

**字段规则**

| 字段 | 规则 |
| --- | --- |
| name | 必填，为空返回 400 |
| asset_no | 留空自动生成（格式 `前缀-YYYYMMDD-NN`）；手填须符合格式规则且唯一 |
| category | 默认 IT设备 |
| status | 默认在库 |
| price | 数字，默认 0 |
| rack_id / u_start / u_height | 三者同时提供时校验 U 位合法性 |

**响应**

```json
{ "success": true, "id": 14, "asset_no": "IT-20260826-00" }
```

**错误**

| 状态码 | 原因 |
| --- | --- |
| 400 | 名称为空 / 编号重复 / 编号格式错误 / U 位冲突或超出机柜总 U 数 |

---

### GET `/api/cmdb/assets/{asset_id}`

获取单条资产详情。

**响应**：完整资产对象（含 `config`、`ports` 数组）。

**错误**：404 资产不存在。

---

### PUT `/api/cmdb/assets/{asset_id}`

更新资产。

**请求体**：同 POST，但仅需传入要修改的字段。

**特殊规则**
- `asset_no` 可修改，但须重新校验格式与唯一性。
- U 位字段（`rack_id` / `u_start` / `u_height`）任一变化时触发完整 U 位校验。
- `ports` 字段整表替换（传入完整端口数组）。
- `config.system_info` 仅覆盖 `system_info` 键，保留 `config` 中的其他键。

**错误**：400 校验失败 / 404 资产不存在。

---

### DELETE `/api/cmdb/assets/{asset_id}`

删除资产。关联端口通过 ON DELETE CASCADE 一并删除。

**响应**：`{ "success": true }`

---

### POST `/api/cmdb/assets/batch-update`

批量更新盘点时间。

**请求体**

```json
{
  "ids": [1, 2, 3],
  "inventory_time": "2026-08-25"
}
```

**规则**
- `ids` 必须为非空整数数组。
- `inventory_time` 必须为 `YYYY-MM-DD` 格式的合法日期。
- 不存在的 id 静默跳过。

**响应**：`{ "success": true, "updated": 3 }`

---

### POST `/api/cmdb/assets/batch-delete`

批量删除资产。

**请求体**

```json
{ "ids": [1, 2, 3] }
```

**响应**：`{ "success": true, "deleted": 3 }`

---

### GET `/api/cmdb/assets/import-template`

下载 CSV 导入模板。

**响应**：CSV 文件（Content-Disposition: attachment），首部含 `#` 注释行说明各列填写方法。

---

### POST `/api/cmdb/assets/import-csv`

CSV 批量导入资产。

**请求体**

```json
{ "content": "asset_no,name,category,...\n,核心交换机-01,IT设备,...\n" }
```

**响应**

```json
{
  "success": true,
  "added": 10,
  "failed": 2,
  "errors": ["第5行：创建失败 - 资产编号已存在", "第8行：name 为必填项，已跳过"]
}
```

---

## 端口管理

### GET `/api/cmdb/assets/{asset_id}/ports`

读取资产端口列表。

**响应**

```json
{
  "ports": [
    {
      "id": 1,
      "asset_id": 1,
      "port_num": 1,
      "name": "eth0",
      "speed": "100GbE",
      "mac": "D4:BE:D9:11:22:33",
      "ip": "10.10.10.5",
      "remote_device": "Cisco 93180",
      "remote_port": "Eth1/1",
      "note": "业务口",
      "status": "connected"
    }
  ]
}
```

---

### PUT `/api/cmdb/assets/{asset_id}/ports`

整表替换资产端口。

**请求体**

```json
{
  "ports": [
    { "port_num": 1, "name": "eth0", "speed": "100GbE", "mac": "D4:BE:D9:11:22:33", "ip": "10.10.10.5", "remote_device": "Cisco 93180", "remote_port": "Eth1/1", "note": "业务口", "status": "connected" }
  ]
}
```

**规则**
- 端口号必须为正整数。
- 端口非空时自动标记资产为网络设备。
- 端口清空时是否复位标记由 `is_network_device` 参数决定。

**错误**：404 资产不存在 / 400 端口号非法。

---

## 机柜管理

### GET `/api/cmdb/racks`

机柜列表（含每台机柜的设备列表）。

**响应**

```json
{
  "racks": [
    {
      "id": 1,
      "rack_id": "CAB-A01",
      "name": "CAB-A01 标准机柜",
      "location": "A栋数据中心",
      "total_u": 42,
      "status": "使用中",
      "devices": [
        { "id": 5, "name": "Huawei AR6140", "subtype": "路由器", "u_start": 5, "u_height": 1, "status": "使用中" }
      ]
    }
  ]
}
```

---

### GET `/api/cmdb/racks/{rack_id}`

机柜详情（含设备列表）。

**错误**：404 机柜不存在。

---

### POST `/api/cmdb/racks`

新增机柜。

**请求体**

```json
{
  "rack_id": "CAB-A01",
  "name": "A区标准机柜",
  "location": "A栋数据中心",
  "total_u": 42,
  "status": "使用中",
  "note": ""
}
```

**规则**
- `rack_id` 必填且唯一。
- `total_u` 默认 42。

**错误**：400 编号为空或已存在。

---

### PUT `/api/cmdb/racks/{rack_id}`

更新机柜（`rack_id` 本身不可改）。

**特殊规则**
- 调小 `total_u` 时校验是否导致已上架设备越界，越界返回 400。

**错误**：400 越界 / 404 不存在。

---

### DELETE `/api/cmdb/racks/{rack_id}`

删除机柜。

**查询参数**

| 参数 | 说明 |
| --- | --- |
| force | 0（默认）= 机柜内有设备时拒绝；1 = 先解绑下架再删除 |

**行为**
- 机柜内无设备：直接删除。
- 机柜内有设备 + force=0：返回 400 + `devices` 数量。
- 机柜内有设备 + force=1：先清空所有设备的 `rack_id`/`u_start`/`u_height`（台账保留），再删除机柜。

**响应**：`{ "success": true, "unbound": 3 }`

---

### POST `/api/cmdb/assets/{asset_id}/unbind-rack`

将资产移出机柜（仅解绑 U 位，资产台账保留）。

**响应**：`{ "success": true }`

---

## 维保管理

### GET `/api/cmdb/maintenance`

维保列表（即将到期 + 正常在保）。

**响应**

```json
{
  "expiring": [
    { "id": 6, "asset_no": "IT-20231210-05", "name": "Sangfor AF-1000", "warranty_expire": "2024-12-09", "days_left": -625, ... }
  ],
  "normal": [
    { "id": 1, "asset_no": "IT-20230601-01", "name": "Dell PowerEdge R750", "warranty_expire": "2026-05-31", "days_left": 278, ... }
  ]
}
```

- `expiring`：保修剩余天数 ≤ 30 天（含已过保），按到期日排序。
- `normal`：保修剩余天数 > 30 天，按到期日排序。

---

## 报表导出

### GET `/api/cmdb/reports/export`

报表导出。

**查询参数**

| 参数 | 值 | 说明 |
| --- | --- | --- |
| type | inventory | 资产盘点报表 |
| type | dept | 部门资产汇总表 |
| type | warranty | 维保到期预警报表 |
| format | html | HTML 网页报表 |
| format | csv | CSV 文件（UTF-8 BOM） |

**响应**
- HTML：`Content-Type: text/html`
- CSV：`Content-Type: text/csv; charset=utf-8`，文件名如 `cmdb_inventory.csv`

**错误**：400 type 值非法。

---

## 数据备份

### GET `/api/cmdb/backup/export`

全量导出 JSON 备份（资产 + 端口 + 机柜）。

**响应**：JSON 文件，文件名 `cmdb_backup_YYYYMMDD_HHMMSS.json`。

---

### POST `/api/cmdb/backup/import`

从 JSON 备份恢复数据。

**请求体**

```json
{
  "content": "{ ... JSON 备份文本 ... }",
  "mode": "merge"
}
```

**mode 说明**

| mode | 行为 |
| --- | --- |
| merge | 按 asset_no（其次 sn）匹配，存在则更新、不存在则新增；机柜按 rack_id upsert |
| overwrite | 先清空 ports/assets/racks，再整表还原（灾难恢复） |

**响应**

```json
{
  "success": true,
  "mode": "merge",
  "added": 5,
  "updated": 3,
  "skipped": 1,
  "racks_added": 1,
  "racks_updated": 2,
  "errors": ["资产 XXX: 错误原因"],
  "total_after": 18
}
```

**错误**：400 JSON 解析失败 / 缺少 assets 列表。

---

## 错误码

| HTTP 状态码 | 含义 | 典型场景 |
| --- | --- | --- |
| 200 | 成功 | 正常响应 |
| 400 | 请求错误 | 名称为空、编号重复、U 位冲突、JSON 解析失败、参数非法 |
| 404 | 资源不存在 | 资产/机柜 ID 不存在 |
| 422 | 参数校验失败 | size > 200 |
| 500 | 服务器内部错误 | 未捕获异常（应避免） |

---

## 调用示例

### 获取资产列表

```bash
curl -H 'Authorization: Bearer <token>' \
  'https://host:port/api/cmdb/assets?page=1&size=10&sort_by=id&sort_order=desc'
```

### 获取 IT 设备列表

```bash
curl -H 'Authorization: Bearer <token>' \
  'https://host:port/api/cmdb/assets?category=IT设备&size=200'
```

### 新增资产

```bash
curl -X POST -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"name":"测试服务器","category":"IT设备","subtype":"服务器"}' \
  https://host:port/api/cmdb/assets
```

### 批量更新盘点时间

```bash
curl -X POST -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"ids":[1,2,3],"inventory_time":"2026-08-25"}' \
  https://host:port/api/cmdb/assets/batch-update
```

### 批量删除

```bash
curl -X POST -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"ids":[1,2,3]}' \
  https://host:port/api/cmdb/assets/batch-delete
```

### 导出备份

```bash
curl -H 'Authorization: Bearer <token>' \
  https://host:port/api/cmdb/backup/export -o backup.json
```

### 导入备份（合并模式）

```bash
curl -X POST -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"content":"<JSON文本>","mode":"merge"}' \
  https://host:port/api/cmdb/backup/import
```

### 导出报表（CSV）

```bash
curl -H 'Authorization: Bearer <token>' \
  'https://host:port/api/cmdb/reports/export?type=inventory&format=csv' -o report.csv
```
