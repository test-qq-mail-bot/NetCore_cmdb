"""
db.py - CMDB 插件兼容再导出层（向后兼容）

历史实现集中在本文件（735 行）；现已按功能拆分为：
  - common.py                  数据库基础设施 + 复用工具 + 种子数据
  - modules/assets.py          资产 CRUD
  - modules/racks.py           机柜 CRUD
  - modules/ports.py           端口读取 / 写入
  - modules/dashboard.py       仪表盘统计
  - modules/maintenance.py     维保到期预警
  - modules/reports.py         报表查询
  - modules/backup.py          全量导入 / 导出

本文件仅做符号再导出。截至当前版本，仓库内已无任何模块 import 它
（__init__.py 只导入 common，tests/smoke_cmdb.py 只导入 common 与 plugin），
保留它是因为 build_generated.spec 仍把 "plugins.cmdb.db" 列为 hiddenimports，
且外部脚本可能沿用 `from plugins.cmdb import db` 的旧写法。
新代码请直接使用 common 与各 modules 子包，勿在此新增业务逻辑。
"""
from plugins.cmdb import common
from plugins.cmdb.modules import assets, racks, ports, dashboard, maintenance, reports, backup

# —— 数据层符号（common） ——
DB_PATH = common.DB_PATH
CATEGORY_PREFIX = common.CATEGORY_PREFIX
init_db = common.init_db
_now = common._now
_gen_asset_no = common._gen_asset_no
_row_to_asset = common._row_to_asset
_days_left = common._days_left
_expiring_list = common._expiring_list
_serialize_config = common._serialize_config
seed_if_empty = common.seed_if_empty

# —— 资产（modules.assets） ——
create_asset = assets.create_asset
get_asset = assets.get_asset
list_assets = assets.list_assets
update_asset = assets.update_asset
delete_asset = assets.delete_asset

# —— 端口（modules.ports） ——
_get_ports = ports._get_ports
get_ports = ports.get_ports
_replace_ports = ports._replace_ports

# —— 机柜（modules.racks） ——
create_rack = racks.create_rack
update_rack = racks.update_rack
list_racks = racks.list_racks
get_rack = racks.get_rack
_rack_devices = racks._rack_devices

# —— 仪表盘 / 维保 / 报表 ——
dashboard_stats = dashboard.dashboard_stats
maintenance_lists = maintenance.maintenance_lists
report_inventory = reports.report_inventory
report_by_dept = reports.report_by_dept

# —— 备份 / 恢复（modules.backup） ——
BACKUP_VERSION = backup.BACKUP_VERSION
EXPORT_ASSET_FIELDS = backup.EXPORT_ASSET_FIELDS
EXPORT_RACK_FIELDS = backup.EXPORT_RACK_FIELDS
EXPORT_PORT_FIELDS = backup.EXPORT_PORT_FIELDS
export_all = backup.export_all
import_all = backup.import_all
_insert_asset_full = backup._insert_asset_full
_update_asset_full = backup._update_asset_full
_upsert_rack = backup._upsert_rack
