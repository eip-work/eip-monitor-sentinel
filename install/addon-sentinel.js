async function installGrafanaDb (context, dbUrl, inputName) {
  await context.$grafanaDashboards.get(dbUrl).then(resp => {
    console.log(dbUrl, resp.data)
    let dashboardCreate = {
      dashboard: resp.data,
      folderId: 0,
      inputs: [{name: inputName, type: "datasource", pluginId: "prometheus", value: "Prometheus"}],
      overwrite: true
    }
    context.$grafanaApi.post(`${context.namespace}_k8s_namespace/api/dashboards/import`, dashboardCreate).then(resp => {
      console.log('创建 dashboard 成功', resp.data)
      context.$notify({
        title: '创建 dashboard 成功',
        message: dbUrl,
        type: 'success',
        duration: 5000
      });
    })
  }).catch(e => {
    context.$message.error(`为 ${context.namespace} 初始化 grafana 失败: ` + e)
  })
}

let addon = {
  preFlight: function (context) {
    console.log('preFlight 2 - ' + context.namespace)
    context.$grafanaApi.get(`${context.namespace}_k8s_namespace/api/datasources`).then(async resp => {
      let creatingDatasource = true
      for (let item of resp.data) {
        if (item.url === 'http://monitor-prometheus:9090') {
          creatingDatasource = false
        }
      }
      if (creatingDatasource) {
        let datasource = {
          name: "Prometheus",
          type: "prometheus",
          url: "http://monitor-prometheus:9090",
          orgId: 1,
          access:"proxy",
          basicAuth:false,
          readOnly: false,
          basicAuthPassword: '',
          basicAuthUser: '',
          database: '',
          isDefault: true,
          jsonData: {httpMethod: "GET", keepCookies: []},
          password: '',
          user: '',
          version: 1,
          withCredentials: false
        }
        await context.$grafanaApi.post(`${context.namespace}_k8s_namespace/api/datasources`, datasource).then(resp => {
          context.$notify({
            title: '创建 datasource 成功',
            message: `为 ${context.namespace} 的grafana 创建 prometheus datasource 成功`,
            type: 'success',
            duration: 5000
          });
        }).catch(e => {
          console.error(e)
          context.$message.error('调用 grafana 接口创建 datasource 失败: ' + e)
        })
      } else {
        console.log(`无需为 ${context.namespace} 初始化 grafana prometheus datasource`)
      }
      context.$grafanaApi.get(`${context.namespace}_k8s_namespace/api/search?mode=tree&skipRecent=true&skipStarred=true&starred=false`).then(async resp => {
        let dbs = {
          'db/jvm-micrometer': {
            json: 'scoped/4701.json',
            ds: 'DS_PROMETHEUS'
          },
          'db/mysql-overview': {
            json: 'scoped/7362.json',
            ds: 'DS_PROMETHEUS'
          },
          'db/nginx-vts-stats': {
            json: 'scoped/2949.json',
            ds: 'DS_PROMETHEUS'
          }
        }
        for (let db of resp.data) { // 不再创建已经存在的 dashboard
          console.log(db.uri)
          delete dbs[db.uri]
        }
        for (let i in dbs) {
          await installGrafanaDb(context, dbs[i].json, dbs[i].ds)
        }
        this.enabled = true
      })
    }).catch(e => {
      console.error(e)
      if (e.response && (e.response.status === 404 || e.response.status === 502)) {
        this.$message.warning(`${this.name} 中未安装 eip 监控套件`)
      } else {
        context.$message.error('调用 grafana 接口失败: ' + e)
      }
    })
    // context.$notify({ title: 'monitor-2', message: 'preFlight 2 - ' + context.namespace})
  },
  nodes: [],
  pods: [],
  containers: []
}

async function openNginxMonitor (context) {
  console.log('openNginxMonitor')
  let dashboardUrl = undefined
  let failed = false
  this.loading = true
  await context.$grafanaApi.get(`${context.namespace}_k8s_namespace/api/search?mode=tree&query=Nginx VTS Stats&skipRecent=true&skipStarred=true&starred=false`).then(resp => {
    for (let item of resp.data) {
      if (item.uri === 'db/nginx-vts-stats') {
        dashboardUrl = item.url
      }
    }
  }).catch(e => {
    console.log(e)
    context.$message.error('调用 grafana 接口失败: ' + e)
    failed = true
    this.loading = false
  })
  if (failed) return
  let start = context.dateFns.getTime(context.dateFns.addHours(new Date(), -12)) / 1000
  let end = context.dateFns.getTime(new Date()) / 1000
  let instance = undefined
  await context.$grafanaApi.get(`${context.namespace}_k8s_namespace/api/datasources/proxy/Prometheus/api/v1/series?match[]=nginx_server_bytes&start=${start}&end=${end}`).then(resp => {
    for (let item of resp.data.data) {
      if (item.instance.indexOf(context.podIpAddress) === 0) {
        instance = item.instance
        break
      }
    }
  }).catch(e => {
    console.log(e)
    context.$message.error('调用 grafana 接口失败: ' + e)
    this.loading = false
    failed = true
  })
  if (failed) return
  if (instance === undefined) {
    context.$message.error('grafana 中未找到 12 小时内的监控数据')
    this.loading = false
    return
  }
  // http://monitor-grafana.pzy-test.liangzixin.xyz/grafana/pzy-test_k8s_namespace/d/maEwS8GWk/nginx-vts-stats?orgId=1&var-Instance=192.168.18.224:9913&var-Host=All&var-Upstream=All
  // let url = `${dashboardUrl}?orgId=1&var-application=${container.name.toUpperCase()}&var-instance=${instance}&var-jvm_memory_pool_heap=All&var-jvm_memory_pool_nonheap=All&from=now-1h&to=now`
  let url = `${dashboardUrl}?orgId=1&var-Instance=${instance}&var-Host=All&var-Upstream=All&from=now-1h&to=now&kiosk=tv`
  console.log('openNginxMonitor', url)
  window.open(url, '_blank')
  this.loading = false
}

let NginxMonitor = {
  title: "Nginx 监控",
  loading: false,
  icon: 'el-icon-monitor',
  visible: function (context) {
    // console.log('检查Nginx监控是否可见', context)
    return context.containerName.indexOf('web') === 0
  },
  openMonitoringPage: openNginxMonitor
}

addon.containers.push(NginxMonitor)

window.EIP_MONITOR_ADDON_TO_ACTIVATE = addon
