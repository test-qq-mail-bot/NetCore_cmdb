/* CMDB - 生产设备资产 */
(function () {
    window.NC.registerPage('cmdb_production', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="生产设备" subtitle="机床 / 生产线 / 检测设备台账">
            <el-button size="small" @click="downloadCsvTemplate">下载导入模板</el-button>
            <el-upload :auto-upload="false" :on-change="onCsvFile" :show-file-list="false" accept=".csv" style="display:inline-block;">
              <el-button size="small" :loading="csvImporting">CSV 导入</el-button>
            </el-upload>
            <el-button size="small" :loading="exporting" @click="backupExport">导出备份</el-button>
            <el-upload :auto-upload="false" :on-change="onBackupFile" :show-file-list="false" accept=".json" style="display:inline-block;">
              <el-button size="small" :loading="importing">导入备份</el-button>
            </el-upload>
            <el-button type="primary" @click="openNew">新建资产</el-button>
          </CmdbPageHeader>
          <el-form :inline="true" size="small" style="margin-bottom:8px;">
            <el-form-item label="搜索"><el-input v-model="search" placeholder="名称/编号/使用人" clearable @keyup.enter="onSearch" @clear="onSearch" style="width:240px;"></el-input></el-form-item>
            <el-form-item><el-button type="primary" @click="onSearch">查询</el-button></el-form-item>
            <el-form-item>
              <el-button type="warning" :disabled="!selected.length" @click="openBatchInventory">
                批量更新盘点时间<span v-if="selected.length"> ({{selected.length}})</span>
              </el-button>
            </el-form-item>
            <el-form-item>
              <el-button type="danger" :disabled="!selected.length" @click="batchDelete">
                批量删除<span v-if="selected.length"> ({{selected.length}})</span>
              </el-button>
            </el-form-item>
          </el-form>
          <nc-table ref="table" :data="searched" :columns="cols" client-paged selectable row-key="id"
                    :page="page" :page-size="size" :page-sizes="[5,10,20,50]" size="small"
                    @selection-change="onSelect" @page-change="onPage" @size-change="onSize">
            <template #col-name="{row}"><b>{{row.name}}</b></template>
            <template #col-subtype="{row}"><el-tag size="small">{{row.subtype||'-'}}</el-tag></template>
            <template #col-status="{row}"><el-tag size="small" :type="row.status==='使用中'||row.status==='运行中'?'success':row.status==='维修中'?'warning':'info'">{{row.status}}</el-tag></template>
            <template #col-warranty_expire="{row}"><el-tag size="small" :type="warrantyType(row)">{{warrantyText(row)}}</el-tag></template>
            <template #col-ops="{row}">
                <el-button size="small" text type="primary" @click.stop="openDetail(row)">详情</el-button>
                <el-button size="small" text type="primary" @click.stop="openEdit(row)">编辑</el-button>
                <el-button size="small" text type="danger" @click.stop="doDelete(row)">删除</el-button>
            </template>
          </nc-table>
          <CmdbAssetForm ref="formDlg" @saved="load"/>
          <CmdbAssetDetail ref="detailDlg" @changed="load" @edit="openEdit"/>
          <el-dialog v-model="batchVisible" title="批量更新盘点时间" width="420px" :close-on-click-modal="false">
            <el-form label-width="90px" size="small">
              <el-form-item label="盘点时间">
                <el-date-picker v-model="batchDate" type="date" value-format="YYYY-MM-DD" placeholder="选择盘点日期" style="width:100%;"></el-date-picker>
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="batchVisible=false">取消</el-button>
              <el-button type="primary" :disabled="!batchDate" :loading="batchSaving" @click="confirmBatchInventory">确定</el-button>
            </template>
          </el-dialog>
        </div>`,
        data() { return { search: '', allRows: [], page: 1, size: 10, selected: [], batchVisible: false, batchDate: '', batchSaving: false, exporting: false, importing: false, csvImporting: false }; },
        computed: {
            searched() {
                const q = (this.search || '').trim().toLowerCase();
                if (!q) return this.allRows;
                return this.allRows.filter(r => [r.name, r.asset_no, r.user].some(v => v && String(v).toLowerCase().indexOf(q) !== -1));
            },
            cols() {
                return [
                    { label: '资产编号', prop: 'asset_no', width: 140, sortable: true, filterable: true },
                    { label: '名称', prop: 'name', minWidth: 150, sortable: true, filterable: true, slotName: 'col-name' },
                    { label: '子类', prop: 'subtype', width: 110, sortable: true, filterable: true, slotName: 'col-subtype' },
                    { label: '使用人', prop: 'user', width: 90, sortable: true, filterable: true },
                    { label: '位置', prop: 'location', minWidth: 120, sortable: true, filterable: true },
                    { label: '状态', prop: 'status', width: 90, sortable: true, filterable: true, slotName: 'col-status' },
                    { label: '维保', prop: 'warranty_expire', width: 120, sortable: true, filterable: true, slotName: 'col-warranty_expire' },
                    { label: '盘点时间', prop: 'inventory_time', width: 120, sortable: true, filterable: true },
                    { label: '操作', width: 200, slotName: 'col-ops' },
                ];
            },
        },
        methods: {
            async downloadCsvTemplate() {
                try {
                    const r = await http.get('/api/cmdb/assets/import-template', { responseType: 'blob' });
                    const url = URL.createObjectURL(r.data);
                    const a = document.createElement('a'); a.href = url; a.download = 'cmdb_import_template.csv';
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    this.$message.success('模板已下载，请按模板内注释说明填写');
                } catch (e) { this.$message.error('模板下载失败：' + (e.response && e.response.data && e.response.data.detail || e.message)); }
            },
            onCsvFile(file) {
                const _name = (file.name || (file.raw && file.raw.name) || '').toLowerCase();
                if (!_name.endsWith('.csv')) { this.$message.error('仅支持 CSV 文件'); return; }
                const raw = file.raw || file;
                const reader = new FileReader();
                reader.onload = async () => {
                    this.csvImporting = true;
                    try {
                        const r = await http.post('/api/cmdb/assets/import-csv', { content: reader.result });
                        const d = r.data || {};
                        if (d.success === false) { this.$message.error('导入失败：' + (d.message || '未知错误')); }
                        else {
                            this.$message.success('导入完成：成功 ' + (d.added || 0) + ' 条，失败 ' + (d.failed || 0) + ' 条');
                            if (d.errors && d.errors.length) { this.$alert(d.errors.join('\n'), '导入错误明细', { type: 'warning' }); }
                            this.load();
                        }
                    } catch (e) { this.$message.error('导入失败：' + (e.response && e.response.data && (e.response.data.message || e.response.data.detail) || e.message)); }
                    finally { this.csvImporting = false; }
                };
                reader.onerror = () => this.$message.error('读取文件失败');
                reader.readAsText(raw, 'utf-8');
            },
            async backupExport() {
                this.exporting = true;
                try {
                    const r = await http.get('/api/cmdb/backup/export', { responseType: 'blob' });
                    const cd = (r.headers && (r.headers['content-disposition'] || r.headers['Content-Disposition'])) || '';
                    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="?([^";]+)"?/);
                    const fname = m ? decodeURIComponent(m[1]) : 'cmdb_backup.json';
                    const url = URL.createObjectURL(r.data);
                    const a = document.createElement('a'); a.href = url; a.download = fname;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                    this.$message.success('已导出备份 ' + fname);
                } catch (e) { this.$message.error('导出失败：' + (e.response && e.response.data && e.response.data.detail || e.message)); }
                finally { this.exporting = false; }
            },
            onBackupFile(file) {
                const _name = (file.name || (file.raw && file.raw.name) || '').toLowerCase();
                if (!_name.endsWith('.json')) { this.$message.error('仅支持 JSON 备份文件'); return; }
                const raw = file.raw || file;
                const reader = new FileReader();
                reader.onload = async () => {
                    this.importing = true;
                    try {
                        const r = await http.post('/api/cmdb/backup/import', { content: reader.result, mode: 'merge' });
                        const d = r.data || {};
                        if (d.success === false) { this.$message.error('导入失败：' + (d.message || '未知错误')); }
                        else {
                            this.$message.success('导入完成：新增 ' + (d.added || 0) + '，更新 ' + (d.updated || 0) + '，跳过 ' + (d.skipped || 0));
                            this.load();
                        }
                    } catch (e) { this.$message.error('导入失败：' + (e.response && e.response.data && (e.response.data.message || e.response.data.detail) || e.message)); }
                    finally { this.importing = false; }
                };
                reader.onerror = () => this.$message.error('读取文件失败');
                reader.readAsText(raw);
            },
            daysLeft(row) { if (!row.warranty_expire) return null; const t = new Date(); t.setHours(0,0,0,0); const e = new Date(row.warranty_expire); e.setHours(0,0,0,0); return Math.round((e - t) / 86400000); },
            warrantyType(row) { const d = this.daysLeft(row); if (d === null) return 'info'; return d < 0 ? 'danger' : d <= 30 ? 'warning' : 'success'; },
            warrantyText(row) { const d = this.daysLeft(row); if (d === null) return '无维保'; return d < 0 ? '已过保'+(-d)+'天' : '剩余'+d+'天'; },
            async load() {
                try {
                    const PAGE_SIZE = 200, MAX_ROWS = 10000;
                    const baseParams = { size: PAGE_SIZE, category: '生产设备' };
                    const first = await http.get('/api/cmdb/assets', { params: Object.assign({ page: 1 }, baseParams) });
                    const rows = first.data.assets || [];
                    const pages = Math.ceil(Math.min(first.data.total || 0, MAX_ROWS) / PAGE_SIZE);
                    if (pages > 1) {
                        const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
                            http.get('/api/cmdb/assets', { params: Object.assign({ page: i + 2 }, baseParams) })));
                        rest.forEach(r => { rows.push.apply(rows, r.data.assets || []); });
                    }
                    this.allRows = rows;
                    this.page = 1;
                } catch (e) { this.$message.error('加载失败'); }
            },
            onSearch() { this.page = 1; },
            onSfSort(p) { if (!p || !p.key) return; this.sfOnSort(p); this.page = 1; },
            onSfFilter(p) { this.sfOnFilter(p); this.page = 1; },
            onPage(p) { this.page = p; },
            onSize(s) { this.size = s; this.page = 1; },
            onSelect(rows) { this.selected = rows; },
            openBatchInventory() {
                if (!this.selected.length) { this.$message.warning('请先勾选要更新的资产'); return; }
                this.batchDate = '';
                this.batchVisible = true;
            },
            async confirmBatchInventory() {
                if (!this.batchDate) { this.$message.warning('请选择盘点时间'); return; }
                const n = this.selected.length;
                const date = this.batchDate;
                try {
                    await this.$confirm('确认将选中的 ' + n + ' 台设备盘点时间更新为 ' + date + '？', '批量更新盘点时间', { type: 'warning' });
                } catch (e) { return; }
                this.batchSaving = true;
                try {
                    const ids = this.selected.map(r => r.id);
                    const r = await http.post('/api/cmdb/assets/batch-update', { ids: ids, inventory_time: date });
                    const d = r.data || {};
                    const updated = (d.updated !== undefined && d.updated !== null) ? d.updated : n;
                    this.$message.success('已更新 ' + updated + ' 台资产盘点时间为 ' + date);
                    this.batchVisible = false;
                    if (this.$refs.table) this.$refs.table.clearSelection();
                    this.selected = [];
                    this.load();
                } catch (e) {
                    this.$message.error('批量更新失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { this.batchSaving = false; }
            },
            batchDelete() {
                if (!this.selected.length) { this.$message.warning('请先勾选要删除的资产'); return; }
                const n = this.selected.length;
                this.$confirm('确定删除选中的 ' + n + ' 台资产吗？删除后不可恢复（关联端口将一并删除）。', '批量删除资产', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' }).then(async () => {
                    try {
                        const ids = this.selected.map(r => r.id);
                        const r = await http.post('/api/cmdb/assets/batch-delete', { ids: ids });
                        const d = r.data || {};
                        const deleted = (d.deleted !== undefined && d.deleted !== null) ? d.deleted : n;
                        this.$message.success('已删除 ' + deleted + ' 台资产');
                        if (this.$refs.table) this.$refs.table.clearSelection();
                        this.selected = [];
                        this.load();
                    } catch (e) {
                        this.$message.error('批量删除失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                    }
                }).catch(() => {});
            },
            openNew() { this.$refs.formDlg.open(null, { categories: ['生产设备'], defaultCategory: '生产设备' }); },
            openEdit(row) { this.$refs.formDlg.open(row, { categories: ['生产设备'] }); },
            openDetail(row) { this.$refs.detailDlg.open(row); },
            doDelete(row) { this.$confirm('确定删除资产 ' + row.asset_no + '？', '提示', { type: 'warning' }).then(async () => { await http.delete('/api/cmdb/assets/' + row.id); this.$message.success('已删除'); this.load(); }).catch(() => {}); },
        },
        mounted() { this.load(); },
    }, '生产设备', '/cmdb/production');
})();
