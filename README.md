# cmdb 插件（NetCore Framework）

NetCore Framework 的资产配置管理（CMDB）插件：IT 资产 / 物理资产 / 办公资产的录入、盘点、翻页浏览、多选批量更新盘点时间、CSV 批量导入、机柜 U 位管理、维保预警与报表导出。

> 本仓库为**独立插件源码**，需部署到 NetCore Framework 的 `plugins/` 目录后使用。底层框架仓库：NetCore-Framework。

## 功能概览

- **资产仪表盘**：资产总数、分类占比、维保到期预警等关键指标。
- **IT 资产 / 办公·实物资产**：分页（默认 10，可切 5/10/20/50）、表头排序 + 筛选、关键字搜索；新增 / 编辑 / 删除。
- **批量操作**：多选批量更新盘点时间、批量删除、CSV 批量导入（仅 CSV，含模板下载）。
- **机柜 U 位管理**：机柜增删改、设备上架/下架（仅解绑 U 位，资产台账保留）。
- **维保管理**：保修到期预警（≤30 天标「即将到期」）。
- **报表中心**：资产盘点 / 部门汇总 / 维保到期预警，导出 HTML（网页）或 CSV（带 BOM，Excel 可读）。
- **数据备份**：全量导出 / 导入 JSON（merge / overwrite 两种模式），可完整还原。

## 部署

1. 下载本仓库，得到 `cmdb/` 目录。
2. 将 `cmdb/` 整体复制到框架的 `plugins/` 目录下，即 `plugins/cmdb/`。
3. 重启 NetCore Framework，框架启动时自动扫描 `plugins/cmdb/plugin.py` 并加载（菜单与路由自动注册）。

## 依赖

运行时依赖见 [requirements.txt](cmdb/requirements.txt)（已 `==` 精确锁定）。主框架 `requirements.txt` 已包含全部插件依赖，部署框架时无需单独安装。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `plugin.py` | 插件入口（继承 BasePlugin），集中定义 `/api/cmdb` 路由与菜单；`get_metadata()` 的 version 是全插件版本号的唯一来源 |
| `db.py` | SQLite 连接与数据访问（兼容再导出层） |
| `common.py` | 公共工具（建库、种子数据、`data/config.yaml` 自动生成等） |
| `modules/` | 业务模块：assets / racks / ports / dashboard / maintenance / reports / backup / import_csv |
| `frontend/` | 前端页面脚本（仪表盘 / IT 资产 / 办公资产 / 维保 / 报表 / 二维码库） |
| `data/` | 运行时数据（SQLite `cmdb.db` 与自动生成的 `config.yaml`，**不进仓库**） |

> 说明：插件配置 `config.yaml` 由插件首次加载时自动生成到 `data/` 目录（版本号取自 plugin.py），源码仓库不再维护静态配置文件。

## 文档

本仓库 `wiki/` 目录提供详细文档：

- [教程](wiki/教程.md)
- [程序逻辑](wiki/程序逻辑.md)
- [解决方法](wiki/解决方法.md)
- [插件制作过程](wiki/插件制作过程.md)
- [API 文档](wiki/API文档.md)

## 许可证

Apache-2.0，与主框架一致。
