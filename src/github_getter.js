const makeGHRequest = require('./github_request.js')

const fileDataUrl = ({ repoName, filePath }) =>
  `/repos/${repoName}/contents/${filePath}`

const sha = path => treeData =>
  treeData.tree.filter(node => node.path === path)[0].sha

const fileUrl = ({ repoName, filePath }, treeData) => {
  return `/repos/${repoName}/git/blobs/${sha(filePath)(treeData)}`;
}

const commitsUrl = ({ repoName }) =>
  `/repos/${repoName}/commits`

const repoTreeUrl = ({ repoName }, commits) => {
  return `/repos/${repoName}/git/trees/${commits[0].sha}?recursive=1`
}

const userUrl = ({ name }) =>
  `/users/${name}/repos`

const orgUrl = ({ name }) =>
  `/users/${name}/repos`

const waterfallRequester = token => res => ([processRes, ...rest]) =>
  (opts, cb) => {
    const data = processRes(opts, res)
    if (rest.length) {
      if (! opts['metaData']) {
        opts['metaData'] = res;
      }
      makeGHRequest(data, token, (err, res) => {
        if (err) cb(err)
        else waterfallRequester(token)(res)(rest)(opts, cb)
      })
    } else cb(null, data, opts)
  }

const setCb = f => (...args) => cb => f(...args, cb)

const githubGetter = token => {
  const getterWParams = waterfallRequester(token)

  const getter = getterWParams();

  const gHFile = (_, fileData) => ({
    content: new Buffer(fileData.content, 'base64').toString(),
    fileData
  })

  const fileFromTree = data =>
    getterWParams(data)([fileUrl, gHFile])

  const file = getter([commitsUrl, repoTreeUrl, fileUrl, gHFile])

  const gHRepo = ({ repoName, metaData }, treeData) => {
    const meta = metaData.find(ent => ent.sha === treeData.sha);
    return treeData.tree.reduce((files, treeElem) => {
      if (treeElem.type === 'blob') {
        files[treeElem.path] =
          {fun: setCb
                (fileFromTree(treeData))
                ({ repoName, filePath: treeElem.path, metaData: meta }),
          metaData: meta};
      }
      return files
    }, {})
  }

  const repo = getter([commitsUrl, repoTreeUrl, gHRepo])

  const gHUser = (_, repoDataArr) => {
    return repoDataArr.reduce((repos, { full_name }) => {
      repos[full_name.split('/')[1]] = setCb(repo)({ repoName: full_name })
      return repos
    }, {});
  }

  const user = getter([userUrl, gHUser])

  const org = getter([orgUrl, gHUser])

  return { file, repo, user, org }
}

module.exports = { githubGetter, waterfallRequester, setCb }
