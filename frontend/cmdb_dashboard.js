/* CMDB - 资产仪表盘 */
(function () {
    window.NC.registerPage('cmdb_dashboard', {
        mixins: [window.NC.SF_MIXIN],
template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="资产仪表盘" subtitle="资产配置总览与关键指标"></CmdbPageHeader>
          <el-row :gutter="16">
            <el-col :span="6">
              <div class="cmdb-stat" style="background:linear-gradient(135deg,#4361ee,#3651c4);">
                <div class="cmdb-stat-label">资产总数</div>
                <div class="cmdb-stat-num">{{stats.total_assets || 0}}</div>
                <div class="cmdb-stat-sub">总原值 ¥{{fmtMoney(stats.total_value)}}</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="cmdb-stat" style="background:linear-gradient(135deg,#3a86ff,#2667cc);">
                <div class="cmdb-stat-label">IT 资产</div>
                <div class="cmdb-stat-num">{{stats.it_assets || 0}}</div>
                <div class="cmdb-stat-sub">电脑/服务器/网络</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="cmdb-stat" style="background:linear-gradient(135deg,#4895ef,#2c6fbf);">
                <div class="cmdb-stat-label">机柜总数</div>
                <div class="cmdb-stat-num">{{stats.rack_count || 0}}</div>
                <div class="cmdb-stat-sub">已占 {{stats.used_u||0}} / 总 {{stats.total_u||0}} U</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="cmdb-stat" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
                <div class="cmdb-stat-label">即将过保 (&lt;30天)</div>
                <div class="cmdb-stat-num">{{stats.expiring_count || 0}}</div>
                <div class="cmdb-stat-sub">需续保或处置</div>
              </div>
            </el-col>
          </el-row>
          <el-card style="margin-top:16px;">
            <template #header><b>最近登记资产</b></template>
            <el-table :data="sfApply(recent)" size="small" @row-click="openDetail" style="cursor:pointer;">
              <el-table-column prop="asset_no" label="资产编号" width="140">
<template #header><nc-sf-th label="资产编号" sort-key="asset_no" filter-key="asset_no" prop="asset_no" :source="sfCandidates(recent, 'asset_no')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
              <el-table-column label="名称/子类" min-width="160">
                <template #header><nc-sf-th label="名称/子类" sort-key="name" filter-key="name" prop="name" :source="sfCandidates(recent, 'name')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template>
                <template #default="{row}"><b>{{row.name}}</b><br/><small style="color:var(--nc-text-secondary);">{{row.subtype||''}}</small></template>
              </el-table-column>
              <el-table-column label="分类/子类" width="140">
                <template #default="{row}"><el-tag size="small" type="info">{{row.category}}</el-tag> <el-tag size="small">{{row.subtype||'-'}}</el-tag></template>
              </el-table-column>
              <el-table-column prop="user" label="使用人" width="100">
<template #header><nc-sf-th label="使用人" sort-key="user" filter-key="user" prop="user" :source="sfCandidates(recent, 'user')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template></el-table-column>
              <el-table-column label="位置" min-width="140">
                <template #header><nc-sf-th label="位置" sort-key="location" filter-key="location" prop="location" :source="sfCandidates(recent, 'location')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template>
                <template #default="{row}">{{row.rack_id ? row.rack_id+' '+row.u_start+'U' : (row.location||'-')}}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #header><nc-sf-th label="状态" sort-key="status" filter-key="status" prop="status" :source="sfCandidates(recent, 'status')" @sort="sfOnSort" @filter="sfOnFilter"></nc-sf-th></template>
                <template #default="{row}"><el-tag size="small" :type="row.status==='使用中'||row.status==='运行中'?'success':row.status==='维修中'?'warning':'info'">{{row.status}}</el-tag></template>
              </el-table-column>
              <el-table-column label="维保" width="120">
                <template #default="{row}"><el-tag size="small" :type="warrantyType(row)">{{warrantyText(row)}}</el-tag></template>
              </el-table-column>
            </el-table>
          </el-card>
          <CmdbAssetForm ref="formDlg" @saved="load"/>
          <CmdbAssetDetail ref="detailDlg" @changed="load" @edit="openEdit"/>
        </div>`,
        data() { return { stats: {}, recent: [] }; },
        methods: {
            fmtMoney(v) { return v != null ? Number(v).toLocaleString() : '0'; },
            daysLeft(row) {
                if (!row.warranty_expire) return null;
                const t = new Date(); t.setHours(0,0,0,0);
                const e = new Date(row.warranty_expire); e.setHours(0,0,0,0);
                return Math.round((e - t) / 86400000);
            },
            warrantyType(row) { const d = this.daysLeft(row); if (d === null) return 'info'; return d < 0 ? 'danger' : d <= 30 ? 'warning' : 'success'; },
            warrantyText(row) { const d = this.daysLeft(row); if (d === null) return '无维保'; return d < 0 ? '已过保'+(-d)+'天' : '剩余'+d+'天'; },
            async load() {
                try {
                    const s = await http.get('/api/cmdb/dashboard'); this.stats = s.data;
                    const a = await http.get('/api/cmdb/assets?size=8'); this.recent = a.data.assets || [];
                } catch (e) {}
            },
            openDetail(row) { if (this.$refs.detailDlg) this.$refs.detailDlg.open(row); },
            openEdit(row) { if (this.$refs.formDlg) this.$refs.formDlg.open(row); },
        },
        mounted() { this.load(); },
    }, '资产仪表盘');
})();
