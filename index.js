const fs = require('fs')
const axios = require('axios')
const cheerio = require('cheerio')
const Promise = require('bluebird')
const querystring = require('querystring')

const config = require('./config')
const {username, password, startpage, startype} = config


// 地址真是多得记不住啊 /(ㄒoㄒ)/~~
const LOGIN_URL = 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index'
const LOGIN_API = 'https://accounts.pixiv.net/api/login?lang=zh'
const STAR_URL = `https://www.pixiv.net/bookmark.php?rest=${startype}&order=desc`
//const IMG_URL = 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id='
//const MANAGE_URL = 'https://www.pixiv.net/member_illust.php?mode=manga&illust_id='
const AUTHOR_URL = 'https://www.pixiv.net/member_illust.php?id='
const FOLLOW_URL = `https://www.pixiv.net/bookmark.php?type=user&rest=${startype}&p=`
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'

axios.interceptors.response.use(undefined, async function axiosRetryInterceptor(err) {
    var config = err.config;
    // 如果配置不存在或未设置重试选项，则拒绝
    if (!config || !config.retry) return Promise.reject(err);

    // 设置变量以跟踪重试次数
    config.__retryCount = config.__retryCount || 0;

    // 判断是否超过总重试次数
    if (config.__retryCount >= config.retry) {
        // 返回错误并退出自动重试
        return Promise.reject(err);
    }

    // 增加重试次数
    config.__retryCount += 1;

    //打印当前重试次数
    console.log(config.url +' 自动重试第' + config.__retryCount + '次');

    // 创建新的Promise
    var backoff = new Promise(function (resolve) {
        setTimeout(function () {
            resolve();
        }, config.retryDelay || 1);
    });

    // 返回重试请求
    return backoff.then(await async function () {
        return await axios(config);
    });
});

class Pixiv {
  constructor () {
    this.cookie = ''
    this.author = ''
  }

  // 获取登陆 key
  async getKey () {
    try {
      const res = await axios({
        method: 'get',
        url: LOGIN_URL,
        header: {
          'User-Agent': USER_AGENT
        },
        retry: 10,
        retryDelay: 1000,
        timeout: 5000
      })
      const $ = cheerio.load(res.data)
      const postKey = $('input[name="post_key"]').val()
      const postCookie = res.headers['set-cookie'].join('; ')
      return { postKey, postCookie }
    } catch (err) {
      console.log(err)
    }
  }

  // 登陆
  async login ({ postKey, postCookie }) {
    try {
      const res = await axios({
        method: 'post',
        url: LOGIN_API,
        headers: {
          'User_Agent': USER_AGENT,
          'Content_Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://accounts.pixiv.net',
          'Referer': 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': postCookie
        },
        data: querystring.stringify({
          pixiv_id: username,
          password: password,
          captcha: '',
          g_recaptcha_response: '',
          post_key: postKey,
          source: 'pc',
          ref: 'wwwtop_accounts_index',
          return_to: 'https://www.pixiv.net/'
        }),
        retry: 10,
        retryDelay: 1000,
        timeout: 5000
      })
      const cookie = res.headers['set-cookie'].join('; ')
      // 将 cookie 写入文件
      fs.writeFileSync('cookie.txt', cookie)
      return cookie
    } catch (err) {
      console.log(err)
    }
  }

  // 获取总页数
  async getPageSize (url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        },
        retry: 10,
        retryDelay: 1000,
        timeout: 5000
      })
      const $ = cheerio.load(res.data)
      const pageList = $('.page-list')
      const pageSize = pageList.length ? pageList.children().last().find('a').text() : 1
      return pageSize
    } catch (err) {
      console.log(err)
    }
  }

  // 获取整页作品
  async getImgList (url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        },
        retry: 10,
        retryDelay: 1000,
        timeout: 5000
      })
      const $ = cheerio.load(res.data)
      const list = $('._image-items').eq(0).find('.image-item')
      const imgList = []
      // 如果是下载作者列表，那么不需要每次都去获取作者，而且也获取不到
      let author
      const self = this // 哎，老办法
      list.each(function () {
        const id = $(this).find('img').attr('data-id')
        const name = $(this).find('.title').text()
        author = $(this).find('.user').text()
        const img = {
          id,
          name,
          author
        }
        imgList.push(img)
      })
      return imgList
    } catch (err) {
      console.log(err)
    }
  }

  async download ({ id, name, author }) {
    try {
      const src = `https://www.pixiv.net/ajax/illust/${id}/pages`
      const res = await axios({
        method: 'get',
        url: src,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': `https://www.pixiv.net/member_illust.php?mode=medium&illust_id=${id}`,
          'Cookie': this.cookie
        },
        retry: 10,
        retryDelay: 1000,
        timeout: 5000
      });
      if(!res.data){
		console.log('ERROR (GET)')
		return;
      }
      if(res.data.body.length > 1) var ismanga = true;
      else var ismanga = false;
      if(ismanga){
		console.log('图集(MANGA)')
      }else{
		console.log('单图(PIC)')
      }
      for(let xx in res.data.body){
		let imgUrl = res.data.body[xx].urls.original;
		console.log(imgUrl)
		await this.downloadImg({ id, name, author, imgUrl });
		if(xx == 0 && imgUrl.indexOf("ugoira") != -1){
			try {
			  const src = `https://www.pixiv.net/ajax/illust/${id}/ugoira_meta`
			  const res = await axios({
				method: 'get',
				url: src,
				headers: {
				  'User-Agent': USER_AGENT,
				  'Referer': `https://www.pixiv.net/member_illust.php?mode=medium&illust_id=${id}`,
				  'Cookie': this.cookie
				},
				retry: 10,
				retryDelay: 1000,
				timeout: 5000
			  });
			  if(!res.data || res.data.error){
				console.log('ERROR (GET)')
				return;
			  }
			  let imgUrl = res.data.body.originalSrc;
			  console.log("动图");
			  console.log(imgUrl);
			  await this.downloadImg({ id, name, author, imgUrl });
			}catch(err){
				console.log(err);
			}
		}
      }
    } catch (err) {
      console.log(err)
    }
  }

  // 下载图片
  async downloadImg ({ id, name, author, imgUrl }) {
    if (!imgUrl) {
      console.log(`图片 ${id} 解析错误，请检查知悉！`)
      return
    }
    return new Promise((resolve, reject) => {
	  const fileName = imgUrl.substring(imgUrl.lastIndexOf('/') + 1)
	  const savePath = `download/${fileName}`
		if(fs.existsSync(savePath)){
			console.log(`文件已存在: 文件: ${fileName}	作品: ${name}	画师：${author}`)
			resolve()
		}else{
		  axios({
			method: 'get',
			url: imgUrl,
			responseType: 'stream',
			headers: {
			  'User-Agent': USER_AGENT,
			  'Referer': `https://www.pixiv.net/bookmark.php?rest=${startype}&order=date_d`,
			  'Cookie': this.cookie
			},
			retry: 10,
			retryDelay: 1000,
			timeout: 5000
		  }).then(res => {
			res.data.pipe(fs.createWriteStream(savePath)).on('close', () => {
			  console.log(`下载完成: 文件: ${fileName}	作品: ${name}	画师：${author}`)
			  resolve()
			})
		  }).catch(err => reject(err))
		}
    }).catch(function(err){
		console.error("DOWNLOAD ERROR")
		fs.writeFile('log.log',err);
    })
  }

  // 启动
  async start () {
    console.log("\n程序启动(●'◡'●)  DesignedBy 蝉時雨")

    // 如果不存在下载目录则新建
    if (!fs.existsSync('download')) {
      fs.mkdirSync('download')
    }
    // 如果不存在 cookie 则登陆获取
    if (!fs.existsSync('cookie.txt')) {
      const key = await this.getKey()
      this.cookie = await this.login(key)
    } else {
      this.cookie = fs.readFileSync('cookie.txt', 'utf8')
    }
    var tsuzuku = true;
    var nowwpage = startpage;
    while(tsuzuku){
		var pageSize = await this.getPageSize(STAR_URL+'&p='+nowwpage)
		if(nowwpage >= pageSize){
			tsuzuku = false;
			break;
		}
		for (let i = nowwpage; i <= pageSize; i++) {
			console.log(`--------开始下载第${i}页--------`)
			var url = `${STAR_URL}&p=${i}`
			var imgList = await this.getImgList(url)
			await Promise.map(imgList, (img) => this.download(img), { concurrency: 1 })
			nowwpage = i;
		}
		nowwpage++;
    }
    console.log('\n收藏夹下载完成 o(*￣▽￣*)ブ')
  }
}

// 开始启动
const pixiv = new Pixiv()
pixiv.start()
