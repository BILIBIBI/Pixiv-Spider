const fs = require('fs')
const axios = require('axios')
const cheerio = require('cheerio')
const Promise = require('bluebird')
const querystring = require('querystring')

const config = require('./config')
const {username, password, startpage} = config


// 地址真是多得记不住啊 /(ㄒoㄒ)/~~
const LOGIN_URL = 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index'
const LOGIN_API = 'https://accounts.pixiv.net/api/login?lang=zh'
const STAR_URL = 'https://www.pixiv.net/bookmark.php?rest=show&order=desc'
const IMG_URL = 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id='
const MANAGE_URL = 'https://www.pixiv.net/member_illust.php?mode=manga&illust_id='
const AUTHOR_URL = 'https://www.pixiv.net/member_illust.php?id='
const FOLLOW_URL = 'https://www.pixiv.net/bookmark.php?type=user&rest=show&p='
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'

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
        }
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
        })
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
        }
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
        }
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
        // 日期限制，从小图链接提取日期
        //const src = $(this).find('img').attr('data-src')
        //const suffix = src.split('/img-master/img/')[1]
       // const publishedAt = (suffix.slice(0, 10)).split('/') // 2016/01/26
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
      const src = `${IMG_URL}${id}`
      const res = await axios({
        method: 'get',
        url: src,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
          'Cookie': this.cookie
        }
      })
      var imgUrl = res.data.match(/"original":"(.*?)"},/)[0].replace('"original":"','').replace('"},','').replace(/\\/g,'')
      const imgUrly = imgUrl
      var ismanga = true;
      const mangasrc = `${MANAGE_URL}${id}`
      const res2 = await axios({
        method: 'get',
        url: mangasrc,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': src,
          'Cookie': this.cookie
        }
      }).catch(function(err){
		ismanga = false
      })
      if(ismanga && res2.data.indexOf("エラーが発生しました") !== -1){
		ismanga = false
      }
      if(ismanga){
		console.log('图集(MANGA)')
		const $ = cheerio.load(res2.data)
		const sss = $("img[data-filter='manga-image']")
		for(let y=0;y<sss.length;y++){
			let tt = sss.eq(y).attr("data-index")
			if(tt){
				imgUrl = imgUrly.replace("_p0","_p"+tt)
				console.log(imgUrl)
				await this.downloadImg({ id, name, author, imgUrl })
			}
		}
      }else{
		console.log('单图(PIC)')
		console.log(imgUrl)
		await this.downloadImg({ id, name, author, imgUrl })
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
			  'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
			  'Cookie': this.cookie
			}
		  }).then(res => {
			const fileName = imgUrl.substring(imgUrl.lastIndexOf('/') + 1)
			const savePath = `download/${fileName}`
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
