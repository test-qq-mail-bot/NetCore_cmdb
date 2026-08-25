# API 文档：cmdb 插件

全部接口前缀 `/api/cmdb`，均需 `Authorization: Bearer <token>`。资产相关写操作自动记录审计。

## 仪表盘

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/dashboard` | 资产统计指标（总数、分类占比、维保预警等） |

## 资产（/api/cmdb/assets）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/assets` | 分页列表。参数：`page, size(≤10000), search, category, exclude_category, sort_by, sort_order, filter_col, filter_values`（多选） |
| POST | `/api/cmdb/assets` | 新增资产（请求体为资产字段）。编号重复 / 名称为空返回 400 |
| POST | `/api/cmdb/assets/batch-update` | 批量更新盘点时间 `{ids:[int], inventory_time:"YYYY-MM-DD"}` |
| POST | `/api/cmdb/assets/batch-delete` | 批量删除 `{ids:[int]}` |
| GET | `/api/cmdb/assets/import-template` | 下载 CSV 导入模板（带 `#` 注释列） |
| POST | `/api/cmdb/assets/import-csv` | CSV 批量导入 `{content: <CSV 文本>}`，返回 `{added, failed, errors}` |
| GET | `/api/cmdb/assets/{asset_id}` | 资产详情；不存在返回 404 |
| PUT | `/api/cmdb/assets/{asset_id}` | 更新资产；U 位冲突 / 超限返回 400 |
| DELETE | `/api/cmdb/assets/{asset_id}` | 删除资产 |

## 端口（/api/cmdb/assets/{asset_id}/ports）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/assets/{asset_id}/ports` | 读取端口列表（JSON） |
| PUT | `/api/cmdb/assets/{asset_id}/ports` | 整表更新 `{ports: [...]}`（资产不存在返回 404） |

## 机柜（/api/cmdb/racks）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/racks` | 机柜列表 |
| GET | `/api/cmdb/racks/{rack_id}` | 机柜详情；不存在返回 404 |
| POST | `/api/cmdb/racks` | 新增机柜（rack_id 必填且唯一） |
| PUT | `/api/cmdb/racks/{rack_id}` | 更新机柜；调小总 U 致越界返回 400 |
| DELETE | `/api/cmdb/racks/{rack_id}` | 删除机柜；内有设备默认拒绝，`force=1` 先解绑下架再删 |
| POST | `/api/cmdb/assets/{asset_id}/unbind-rack` | 资产移出机柜（仅解绑 U 位，台账保留） |

## 维保（/api/cmdb/maintenance）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/maintenance` | 维保列表（即将到期 + 正常，含剩余天数） |

## 报表（/api/cmdb/reports/export）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/reports/export` | 报表导出。`type=inventory\|dept\|warranty`，`format=html\|csv`。HTML 返回网页，CSV 带 BOM |

## 备份（/api/cmdb/backup）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cmdb/backup/export` | 全量导出 JSON（资产 + 机柜 + 端口） |
| POST | `/api/cmdb/backup/import` | 导入 JSON `{content, mode:"merge"\|"overwrite"}`；解析失败返回 400 |

## 调用示例

```bash
# 获取资产列表（第 1 页，每页 10，按 id 倒序）
curl -H 'Authorization: Bearer <token>' \
  'https://host:port/api/cmdb/assets?page=1&size=10&sort_by=id&sort_order=desc'

# 批量更新盘点时间
curl -X POST -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"ids":[1,2,3],"inventory_time":"2026-08-25"}' \
  https://host:port/api/cmdb/assets/batch-update
```
