/* CMDB - 页面标题组件 */
(function () {
    if (window.NC && window.NC.jsVersions) {
        window.NC.jsVersions['CmdbPageHeader'] = "";
    }
    window.NC.registerPage('CmdbPageHeader', {
        props: {
            title: { type: String, default: '' },
            subtitle: { type: String, default: '' },
            icon: { type: String, default: '' },
        },
        template: `
        <div class="cmdb-ph">
          <div class="cmdb-ph-bar"></div>
          <div class="cmdb-ph-main">
            <div class="cmdb-ph-title"><i v-if="icon" class="el-icon">{{icon}}</i> {{title}}</div>
            <div v-if="subtitle" class="cmdb-ph-sub">{{subtitle}}</div>
          </div>
          <div class="cmdb-ph-actions"><slot></slot></div>
        </div>`,
    }, '页面标题');
})();
