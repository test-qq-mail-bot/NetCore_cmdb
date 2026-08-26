"""CMDB 插件包（资产配置管理）

common 提供数据库基础设施与种子数据入口，modules 子包含各业务功能。
（db.py 仅作向后兼容再导出层。）
"""
from plugins.NetCore_cmdb import common  # noqa: F401
