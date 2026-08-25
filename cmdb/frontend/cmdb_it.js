/* CMDB - IT 资产管理（资产列表 + 机柜 U 位视图） */
(function () {
    window.NC.registerPage('cmdb_it', {
        mixins: [window.NC.SF_MIXIN],
        template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="IT 资产管理" subtitle="电脑 / 服务器 / 网络设备台账与机柜 U 位视图">
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
          <el-tabs v-model="tab">
            <el-tab-pane label="资产列表" name="list">
              <el-form :inline="true" size="small" style="margin-bottom:8px;">
                <el-form-item label="搜索"><el-input v-model="search" placeholder="名称/编号/使用人/部门/颜色" clearable @keyup.enter="onSearch" @clear="onSearch" style="width:260px;"></el-input></el-form-item>
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
                <template #col-category="{row}"><el-tag size="small" type="info">{{row.category}}</el-tag></template>
                <template #col-subtype="{row}"><el-tag size="small">{{row.subtype||'-'}}</el-tag></template>
                <template #col-status="{row}"><el-tag size="small" :type="row.status==='使用中'||row.status==='运行中'?'success':row.status==='维修中'?'warning':'info'">{{row.status}}</el-tag></template>
                <template #col-warranty_expire="{row}"><el-tag size="small" :type="warrantyType(row)">{{warrantyText(row)}}</el-tag></template>
                <template #col-loc="{row}">{{row.rack_id ? row.rack_id+' '+row.u_start+'U' : (row.location||'-')}}</template>
                <template #col-ops="{row}">
                    <el-button size="small" text type="primary" @click.stop="openDetail(row)">详情</el-button>
                    <el-button size="small" text type="primary" @click.stop="openEdit(row)">编辑</el-button>
                    <el-button size="small" text type="danger" @click.stop="doDelete(row)">删除</el-button>
                </template>
              </nc-table>
            </el-tab-pane>
            <el-tab-pane :label="'机柜视图 ('+racks.length+'台)'" name="rack">
              <div style="margin-bottom:12px;">
                <el-button type="primary" size="small" @click="openRackNew">新建机柜</el-button>
              </div>
              <el-row :gutter="16">
                <el-col v-for="rk in racks" :key="rk.rack_id" :span="8" style="margin-bottom:16px;">
                  <div class="cmdb-rack-card" @click="openRack(rk)">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <b>{{rk.rack_id}}</b>
                      <span>
                        <el-button size="small" text type="primary" @click.stop="openRackEdit(rk)">编辑</el-button>
                        <el-button size="small" text type="danger" @click.stop="deleteRack(rk)">删除</el-button>
                        <el-tag size="small" :type="rk.status==='使用中'?'success':'info'">{{rk.status}}</el-tag>
                      </span>
                    </div>
                    <div style="color:var(--nc-text-secondary);font-size:12px;margin:4px 0;">{{rk.name}} · {{rk.location}} · {{rk.total_u}}U</div>
                    <div>
                      <span v-for="s in rackSlots(rk)" :key="s.u" class="cmdb-mini-slot" :class="s.occupied?'used':'free'" :title="s.u+'U '+(s.occupied?'(已占用)':'(空闲)')"></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;">
                      <span><b>{{usedU(rk)}}</b>U 已用</span><span><b>{{rk.total_u - usedU(rk)}}</b>U 可用</span><span>使用率 <b>{{usage(rk)}}%</b></span>
                    </div>
                  </div>
                </el-col>
              </el-row>
              <el-empty v-if="!racks.length" description="暂无机柜数据"></el-empty>
            </el-tab-pane>
          </el-tabs>
          <CmdbAssetForm ref="formDlg" @saved="refreshAll"/>
          <CmdbAssetDetail ref="detailDlg" @changed="refreshAll" @edit="openEdit"/>
          <el-dialog v-model="rackVisible" :title="'机柜 U 位详情 - '+rackView.rack_id" width="560px">
            <div v-if="rackView.rack_id">
              <el-descriptions :column="2" border size="small" style="margin-bottom:12px;">
                <el-descriptions-item label="机柜">{{rackView.rack_id}}</el-descriptions-item>
                <el-descriptions-item label="名称">{{rackView.name}}</el-descriptions-item>
                <el-descriptions-item label="位置">{{rackView.location}}</el-descriptions-item>
                <el-descriptions-item label="总 U">{{rackView.total_u}}</el-descriptions-item>
              </el-descriptions>
              <div style="margin-bottom:8px;">
                <el-button size="small" type="primary" plain @click="openRackEdit(rackView)">编辑机柜信息</el-button>
                <el-button size="small" type="danger" plain @click="deleteRack(rackView, true)">删除机柜</el-button>
              </div>
              <div style="font-size:12px;color:var(--nc-text-secondary);margin-bottom:6px;">提示：点击已占用 U 位可查看设备；「移出」仅解绑 U 位保留台账，「删除」会彻底删除该资产</div>
              <div v-for="u in rackUList(rackView)" :key="u.u" class="cmdb-rack-unit" :class="u.occupied?'occupied':'empty'"
                   @click="u.occupied && openRackDevice(u)">
                <template v-if="u.occupied">
                  <div class="cmdb-u-main">
                    <span class="cmdb-u-label">{{u.u}}U</span>
                    <b>{{u.device}}</b> ({{u.subtype}}) · {{u.uStart}}U-{{u.uStart+u.height-1}}U · <span style="color:#2b9348;">占用</span>
                  </div>
                  <div class="cmdb-u-actions">
                    <el-button size="small" text type="primary" @click.stop="openRackDeviceDetail(u)">详情</el-button>
                    <el-button size="small" text type="primary" @click.stop="openRackDeviceEdit(u)">编辑</el-button>
                    <el-button size="small" text type="warning" @click.stop="unbindRackDevice(u)">移出</el-button>
                    <el-button size="small" text type="danger" @click.stop="deleteRackDevice(u)">删除</el-button>
                  </div>
                </template>
                <template v-else><span class="cmdb-u-label">{{u.u}}U</span> 空闲</template>
              </div>
            </div>
          </el-dialog>
          <el-dialog v-model="rackFormVisible" :title="rackFormIsEdit ? '编辑机柜' : '新建机柜'" width="520px">
            <el-form :model="rackForm" label-width="90px" size="small">
              <el-form-item label="机柜编号" required>
                <el-input v-model="rackForm.rack_id" :disabled="rackFormIsEdit" placeholder="如 A-01（创建后不可改）"></el-input>
              </el-form-item>
              <el-form-item label="名称"><el-input v-model="rackForm.name" placeholder="机柜名称"></el-input></el-form-item>
              <el-form-item label="位置"><el-input v-model="rackForm.location" placeholder="如 机房A区 3排"></el-input></el-form-item>
              <el-form-item label="总U数"><el-input-number v-model="rackForm.total_u" :min="1" :max="60"></el-input-number></el-form-item>
              <el-form-item label="状态">
                <el-select v-model="rackForm.status" style="width:100%;">
                  <el-option label="使用中" value="使用中"></el-option>
                  <el-option label="闲置" value="闲置"></el-option>
                  <el-option label="停用" value="停用"></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="备注"><el-input v-model="rackForm.note" type="textarea" :rows="2"></el-input></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="rackFormVisible=false">取消</el-button>
              <el-button type="primary" :loading="rackSaving" @click="saveRack">保存</el-button>
            </template>
          </el-dialog>
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
        data() { return { tab: 'list', search: '', allRows: [], page: 1, size: 10,
            selected: [], batchVisible: false, batchDate: '', batchSaving: false,
            racks: [], rackVisible: false, rackView: {}, exporting: false, importing: false,
            csvImporting: false, rackFormVisible: false, rackFormIsEdit: false, rackSaving: false,
            rackForm: { rack_id: '', name: '', location: '', total_u: 42, status: '使用中', note: '' } }; },
        computed: {
            searched() {
                const q = (this.search || '').trim().toLowerCase();
                if (!q) return this.allRows;
                return this.allRows.filter(r => [r.name, r.asset_no, r.user, r.department, r.color, r.brand].some(v => v && String(v).toLowerCase().indexOf(q) !== -1));
            },
            cols() {
                return [
                    { label: '资产编号', prop: 'asset_no', width: 140, sortable: true, filterable: true },
                    { label: '名称', prop: 'name', minWidth: 150, sortable: true, filterable: true, slotName: 'col-name' },
                    { label: '分类', prop: 'category', width: 100, sortable: true, filterable: true, slotName: 'col-category' },
                    { label: '子类', prop: 'subtype', width: 110, sortable: true, filterable: true, slotName: 'col-subtype' },
                    { label: '品牌', prop: 'brand', width: 100, sortable: true, filterable: true },
                    { label: '颜色', prop: 'color', width: 90, sortable: true, filterable: true },
                    { label: '使用人', prop: 'user', width: 90, sortable: true, filterable: true },
                    { label: '位置', prop: '_loc', minWidth: 130, sortable: false, filterable: false, slotName: 'col-loc' },
                    { label: '状态', prop: 'status', width: 90, sortable: true, filterable: true, slotName: 'col-status' },
                    { label: '维保', prop: 'warranty_expire', width: 120, sortable: true, filterable: true, slotName: 'col-warranty_expire' },
                    { label: '盘点时间', prop: 'inventory_time', width: 120, sortable: true, filterable: true },
                    { label: '操作', width: 200, slotName: 'col-ops' },
                ];
            },
        },
        methods: {
            /* ---- CSV 导入（对标数通配置卫士批量导入） ---- */
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
                            let msg = '导入完成：成功 ' + (d.added || 0) + ' 条，失败 ' + (d.failed || 0) + ' 条';
                            this.$message.success(msg);
                            if (d.errors && d.errors.length) {
                                this.$alert(d.errors.join('\\n'), '导入错误明细', { type: 'warning' });
                            }
                            this.refreshAll();
                        }
                    } catch (e) { this.$message.error('导入失败：' + (e.response && e.response.data && (e.response.data.message || e.response.data.detail) || e.message)); }
                    finally { this.csvImporting = false; }
                };
                reader.onerror = () => this.$message.error('读取文件失败');
                reader.readAsText(raw, 'utf-8');
            },
            /* ---- 机柜新建/编辑 ---- */
            openRackNew() {
                this.rackFormIsEdit = false;
                this.rackForm = { rack_id: '', name: '', location: '', total_u: 42, status: '使用中', note: '' };
                this.rackFormVisible = true;
            },
            openRackEdit(rk) {
                this.rackFormIsEdit = true;
                this.rackForm = { rack_id: rk.rack_id, name: rk.name || '', location: rk.location || '',
                    total_u: rk.total_u || 42, status: rk.status || '使用中', note: rk.note || '' };
                this.rackFormVisible = true;
            },
            async saveRack() {
                if (!this.rackForm.rack_id) { this.$message.warning('请填写机柜编号'); return; }
                this.rackSaving = true;
                try {
                    if (this.rackFormIsEdit) {
                        await http.put('/api/cmdb/racks/' + encodeURIComponent(this.rackForm.rack_id), {
                            name: this.rackForm.name, location: this.rackForm.location,
                            total_u: this.rackForm.total_u, status: this.rackForm.status, note: this.rackForm.note });
                        this.$message.success('机柜已更新');
                    } else {
                        await http.post('/api/cmdb/racks', this.rackForm);
                        this.$message.success('机柜已创建');
                    }
                    this.rackFormVisible = false;
                    this.refreshAll();
                } catch (e) { this.$message.error('保存失败：' + (e.response && e.response.data && e.response.data.detail || e.message)); }
                finally { this.rackSaving = false; }
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
                            this.refreshAll();
                        }
                    } catch (e) { this.$message.error('导入失败：' + (e.response && e.response.data && (e.response.data.message || e.response.data.detail) || e.message)); }
                    finally { this.importing = false; }
                };
                reader.onerror = () => this.$message.error('读取文件失败');
                reader.readAsText(raw);
            },
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
                    const params = { page: 1, size: 10000, category: 'IT设备' };
                    const r = await http.get('/api/cmdb/assets', { params });
                    this.allRows = r.data.assets || [];
                    this.page = 1;
                } catch (e) { this.$message.error('加载失败'); }
            },
            onSearch() { this.page = 1; },
            onSfSort(p) { if (!p || !p.key) return; this.sfOnSort(p); this.page = 1; },
            onSfFilter(p) { this.sfOnFilter(p); this.page = 1; },
            async loadRacks() { try { const r = await http.get('/api/cmdb/racks'); this.racks = r.data.racks || []; } catch (e) {} },
            async refreshAll() {
                await this.load(); await this.loadRacks();
                // 若机柜详情弹窗打开中，同步刷新其设备数据
                if (this.rackVisible && this.rackView.rack_id) {
                    const rk = this.racks.find(r => r.rack_id === this.rackView.rack_id);
                    if (rk) this.rackView = rk;
                }
            },
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
                    this.refreshAll();
                } catch (e) {
                    this.$message.error('批量更新失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { this.batchSaving = false; }
            },
            openNew() { this.$refs.formDlg.open(null, { categories: ['IT设备'] }); },
            openEdit(row) { this.$refs.formDlg.open(row, { categories: ['IT设备'] }); },
            openDetail(row) { this.$refs.detailDlg.open(row); },
            doDelete(row) {
                this.$confirm('确定删除资产 ' + row.asset_no + '？', '提示', { type: 'warning' }).then(async () => {
                    await http.delete('/api/cmdb/assets/' + row.id); this.$message.success('已删除'); this.refreshAll();
                }).catch(() => {});
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
                        this.refreshAll();
                    } catch (e) {
                        this.$message.error('批量删除失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                    }
                }).catch(() => {});
            },
            /* ---- 机柜视图 ---- */
            usedU(rk) { return (rk.devices || []).reduce((s, d) => s + (parseInt(d.u_height) || 0), 0); },
            usage(rk) { const t = rk.total_u || 1; return Math.round(this.usedU(rk) / t * 100); },
            rackSlots(rk) {
                const slots = []; const total = rk.total_u || 0;
                for (let u = total; u >= 1; u--) {
                    const occ = (rk.devices || []).find(d => u >= (parseInt(d.u_start) || 0) && u < (parseInt(d.u_start) || 0) + (parseInt(d.u_height) || 1));
                    slots.push({ u: u, occupied: !!occ, device: occ ? occ.name : '' });
                }
                return slots;
            },
            openRack(rk) { this.rackView = rk; this.rackVisible = true; },
            rackUList(rk) {
                const list = [];
                // 渲染范围固定 = 机柜总 U 数。后端在新建/编辑资产、以及调小机柜总U数时
                // 均会校验不越界、不重叠；但备份还原（backup/import）不经过该校验，
                // 极端情况下仍可能存在超出 total_u 的历史数据，这类设备不会显示在此列表中。
                const total = rk.total_u || 0;
                for (let u = total; u >= 1; u--) {
                    const occ = (rk.devices || []).find(d => u >= (parseInt(d.u_start) || 0) && u < (parseInt(d.u_start) || 0) + (parseInt(d.u_height) || 1));
                    list.push({ u: u, occupied: !!occ, id: occ ? occ.id : null, device: occ ? occ.name : '', subtype: occ ? occ.subtype : '', uStart: occ ? parseInt(occ.u_start) : 0, height: occ ? parseInt(occ.u_height) : 1 });
                }
                return list;
            },
            openRackDevice(u) { if (u && u.id) this.openRackDeviceDetail(u); },
            openRackDeviceDetail(u) { if (u && u.id) this.$refs.detailDlg.open({ id: u.id }); },
            openRackDeviceEdit(u) { if (u && u.id) this.$refs.formDlg.open({ id: u.id }, { categories: ['IT设备'] }); },
            /* ---- 机柜 / 机柜内设备删除 ---- */
            async deleteRack(rk, fromDialog) {
                if (!rk || !rk.rack_id) return;
                const url = '/api/cmdb/racks/' + encodeURIComponent(rk.rack_id);
                try {
                    await this.$confirm('确定删除机柜 ' + rk.rack_id + ' ？', '删除机柜', {
                        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
                } catch (e) { return; }
                try {
                    await http.delete(url);
                    this.$message.success('机柜已删除');
                    if (fromDialog) this.rackVisible = false;
                    this.refreshAll();
                    return;
                } catch (e) {
                    const data = (e.response && e.response.data) || {};
                    // 机柜内仍有已上架设备：后端拒绝并回报数量，再次确认后解绑下架（资产台账保留）
                    if (e.response && e.response.status === 400 && data.devices) {
                        try {
                            await this.$confirm(
                                '机柜 ' + rk.rack_id + ' 内还有 ' + data.devices + ' 台已上架设备。' +
                                '继续删除会把这些设备移出机柜（仅解绑 U 位，资产台账保留）。是否继续？',
                                '机柜内有设备', { type: 'warning', confirmButtonText: '解绑并删除', cancelButtonText: '取消' });
                        } catch (e2) { return; }
                        try {
                            const r = await http.delete(url + '?force=1');
                            const n = (r.data && r.data.unbound) || 0;
                            this.$message.success('机柜已删除，' + n + ' 台设备已移出机柜（台账保留）');
                            if (fromDialog) this.rackVisible = false;
                            this.refreshAll();
                        } catch (e3) {
                            this.$message.error('删除失败：' + ((e3.response && e3.response.data && e3.response.data.detail) || e3.message));
                        }
                        return;
                    }
                    this.$message.error('删除失败：' + (data.detail || e.message));
                }
            },
            unbindRackDevice(u) {
                if (!u || !u.id) return;
                this.$confirm('将设备「' + (u.device || u.id) + '」移出机柜？仅解绑 U 位，资产台账保留。', '移出机柜', {
                    type: 'warning', confirmButtonText: '移出', cancelButtonText: '取消' }).then(async () => {
                    try {
                        await http.post('/api/cmdb/assets/' + u.id + '/unbind-rack');
                        this.$message.success('已移出机柜');
                        this.refreshAll();
                    } catch (e) {
                        this.$message.error('移出失败：' + ((e.response && e.response.data && e.response.data.detail) || e.message));
                    }
                }).catch(() => {});
            },
            deleteRackDevice(u) {
                if (!u || !u.id) return;
                this.$confirm('确定彻底删除资产「' + (u.device || u.id) + '」？该操作不可恢复，若只想下架请用「移出」。', '删除资产', {
                    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }).then(async () => {
                    try {
                        await http.delete('/api/cmdb/assets/' + u.id);
                        this.$message.success('资产已删除');
                        this.refreshAll();
                    } catch (e) {
                        this.$message.error('删除失败：' + ((e.response && e.response.data && e.response.data.detail) || e.message));
                    }
                }).catch(() => {});
            },
        },
        mounted() { this.load(); this.loadRacks(); },
    }, 'IT 资产', '/cmdb/it-assets');
})();
