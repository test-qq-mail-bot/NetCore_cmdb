/* CMDB - 维保管理 */
(function () {
    window.NC.registerPage('cmdb_maintenance', {
        mixins: [window.NC.SF_MIXIN],
template: `
        <div class="cmdb-page">
          <CmdbPageHeader title="维保管理" subtitle="过保预警与续保跟踪"></CmdbPageHeader>
          <el-card>
            <template #header><b style="color:#dc3545;">已过保 / 即将到期 (&lt;30天) · {{expiring.length}} 项</b></template>
            <div v-for="a in expiring" :key="a.id" class="cmdb-maint-alert" :class="a.days_left<0?'':'warning'">
              <b>{{a.asset_no}}</b> {{a.name}} · 合同号: {{a.contract_no||'-'}} · 供应商: {{a.supplier||'-'}} · 保修到期: {{a.warranty_expire}}
              · <span :class="a.days_left<0?'text-danger':'text-warning'">{{a.days_left<0?'已过保'+(-a.days_left)+'天':'剩余'+a.days_left+'天'}}</span>
              <el-button size="small" type="primary" plain style="margin-left:12px;" @click="renew(a)">续保</el-button>
              <el-button size="small" type="danger" plain @click="scrap(a)">报废</el-button>
            </div>
            <el-empty v-if="!expiring.length" description="暂无即将到期的资产"></el-empty>
          </el-card>
          <el-dialog v-model="renewVisible" :title="'资产续保 - ' + (renewTarget.asset_no||'')" width="440px" destroy-on-close>
            <el-form :model="renewForm" label-width="90px" size="default">
              <el-form-item label="资产名称"><el-input :model-value="renewTarget.name" disabled></el-input></el-form-item>
              <el-form-item label="新保修到期"><el-date-picker v-model="renewForm.warranty_expire" type="date" value-format="YYYY-MM-DD" style="width:100%"></el-date-picker></el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="renewVisible=false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="doRenew">确认续保</el-button>
            </template>
          </el-dialog>
          <el-card style="margin-top:16px;">
            <template #header><b style="color:#2b9348;">正常维保中 · {{normal.length}} 项</b></template>
            <nc-table :data="normal" :columns="cols">
              <template #col-days_left="{row}">{{row.days_left}} 天</template>
              <template #col-ops="{row}"><el-button size="small" text type="primary" @click="renew(row)">续保</el-button><el-button size="small" text type="danger" @click="scrap(row)">报废</el-button></template>
            </nc-table>
          </el-card>
        </div>`,
        data() { return { expiring: [], normal: [], renewVisible: false, saving: false, renewTarget: {}, renewForm: { warranty_expire: '' } }; },
        computed: {
            cols() {
                return [
                    { label: '资产编号', prop: 'asset_no', width: 140, sortable: true, filterable: true },
                    { label: '名称', prop: 'name', minWidth: 160, sortable: true, filterable: true },
                    { label: '供应商', prop: 'supplier', minWidth: 120, sortable: true, filterable: true },
                    { label: '合同号', prop: 'contract_no', width: 140, sortable: true, filterable: true },
                    { label: '维保到期', prop: 'warranty_expire', width: 130, sortable: true, filterable: true },
                    { label: '剩余天数', prop: 'days_left', width: 100, sortable: true, filterable: true, slotName: 'col-days_left' },
                    { label: '操作', width: 140, slotName: 'col-ops' },
                ];
            },
        },
        methods: {
            async load() {
                try { const r = await http.get('/api/cmdb/maintenance'); this.expiring = r.data.expiring || []; this.normal = r.data.normal || []; }
                catch (e) { this.$message.error('加载失败'); }
            },
            renew(a) {
                this.renewTarget = a;
                this.renewForm = { warranty_expire: a.warranty_expire || '' };
                this.renewVisible = true;
            },
            async doRenew() {
                if (!this.renewForm.warranty_expire) { this.$message.warning('请选择新的保修到期日'); return; }
                this.saving = true;
                try {
                    await http.put('/api/cmdb/assets/' + this.renewTarget.id, {
                        warranty_expire: this.renewForm.warranty_expire,
                    });
                    this.$message.success('续保成功');
                    this.renewVisible = false;
                    this.load();
                } catch (e) {
                    this.$message.error('续保失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                } finally { this.saving = false; }
            },
            scrap(a) {
                this.$confirm('确定将资产「' + (a.name || a.asset_no) + '」标记为报废吗？报废后该资产将不再参与维保统计，仅保留台账信息。', '资产报废', {
                    type: 'warning', confirmButtonText: '确认报废', cancelButtonText: '取消',
                }).then(async () => {
                    try {
                        await http.put('/api/cmdb/assets/' + a.id, { status: '报废' });
                        this.$message.success('已标记为报废');
                        this.load();
                    } catch (e) {
                        this.$message.error('报废失败：' + (e.response && e.response.data && e.response.data.detail || e.message));
                    }
                }).catch(() => {});
            },
        },
        mounted() { this.load(); },
    }, '维保管理');
})();
