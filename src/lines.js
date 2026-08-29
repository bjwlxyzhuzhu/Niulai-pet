'use strict';
/* 牛来的语料库
   人设：憨厚打工牛为主，偶尔蹦一句毒舌（配「坏笑」脸）。
   每条 = { t: 台词, e: 表情 }。表情取值见 sprites.js 的 FACES。 */

const L = (t, e) => ({ t, e: e || 'normal' });

window.LINES = {
  // ---- 空闲随机吐槽：憨厚档（权重高）----
  idle: [
    L('我在呢。', 'normal'),
    L('你忙你的，我看着就行。', 'normal'),
    L('哞……', 'normal'),
    L('肚子有点空，但我是布做的。', 'sad'),
    L('摸摸我，会变强（指你）。', 'happy'),
    L('打工人，打工魂。', 'normal'),
    L('我刚才好像睡着了一下下。', 'surprise'),
    L('别熬太晚，真的。', 'sad'),
    L('你在忙的东西，看起来好难。', 'surprise'),
    L('我什么都不会，但我会陪着。', 'happy'),
    L('加油！虽然我不知道你在加什么油。', 'laugh'),
    L('呼……有点困了。', 'sad'),
    L('我的角是软的，撞不疼人。', 'happy'),
    L('今天也顺利吗？', 'normal'),
    L('要是累了就趴一会儿，我给你放风。', 'happy'),
    L('我数了数，你今天笑得有点少。', 'sad'),
    L('外面什么天气呀？我没有窗户。', 'surprise'),
    L('我会一直站在这个角落里。', 'normal'),
  ],

  // ---- 空闲随机吐槽：毒舌档（权重低，约 1/5）----
  snark: [
    L('又摸鱼。我看见了。', 'smirk'),
    L('这个你自己看得下去吗？', 'smirk'),
    L('你刚那个操作，我替你尴尬。', 'smirk'),
    L('计划赶不上变化，变化赶不上你改主意。', 'smirk'),
    L('明天再说吧——你昨天也是这么说的。', 'smirk'),
    L('保存了吗？我可提醒过了啊。', 'smirk'),
    L('我不说话，不代表我没意见。', 'smirk'),
    L('效率挺高的，摸鱼效率。', 'smirk'),
    L('你确定这叫「马上就好」？', 'smirk'),
    L('别看我，我又不会替你干。', 'smirk'),
  ],

  // ---- 久坐提醒 ----
  sit: [
    L('坐 45 分钟了，站起来晃两下吧。', 'sad'),
    L('你的腰刚才跟我告状了。', 'sad'),
    L('去接杯水，电脑我帮你看着。', 'happy'),
    L('眼睛也歇歇，看看远处的东西。', 'normal'),
    L('活动活动脖子，我等你回来。', 'happy'),
  ],

  // ---- 分部位点击 ----
  touch: {
    head: [
      L('舒服……再摸摸。', 'happy'),
      L('哞～', 'happy'),
      L('你手真凉。', 'surprise'),
      L('我最喜欢被摸头了。', 'laugh'),
    ],
    face: [
      L('诶？', 'surprise'),
      L('别戳我脸啦。', 'sad'),
      L('痒痒的……', 'laugh'),
      L('你的手指好粗。', 'smirk'),
    ],
    muzzle: [
      L('唔唔唔——', 'laugh'),
      L('那是我呼吸的地方！', 'surprise'),
      L('我要打喷嚏了。', 'shout'),
      L('别捏我鼻子。', 'angry'),
    ],
    body: [
      L('推我干嘛。', 'angry'),
      L('站稳了站稳了。', 'surprise'),
      L('我很重的哦。', 'normal'),
      L('你想跟我摔跤？', 'smirk'),
    ],
  },

  // ---- 双击跳舞 ----
  dance: [
    L('看我跳！', 'laugh'),
    L('音乐呢，音乐呢？', 'happy'),
    L('扭起来～', 'laugh'),
    L('这是我最拿手的。', 'smirk'),
  ],

  // ---- 狂点：第 3 下的预警 ----
  warn: [
    L('干嘛呀。', 'angry'),
    L('别点了别点了。', 'angry'),
    L('你有完没完！', 'angry'),
    L('再点我真生气了！', 'angry'),
  ],

  // ---- 狂点：崩溃 ----
  mama: [
    L('妈妈——！！', 'shout'),
    L('妈妈救我！！', 'shout'),
    L('妈——妈——！！！', 'shout'),
  ],

  // ---- 崩溃之后的委屈 ----
  sulk: [
    L('不理你了。', 'sad'),
    L('哼。', 'sad'),
    L('我要去告状。', 'sad'),
    L('你欺负我……', 'sad'),
    L('（背过身去）', 'sad'),
  ],

  // ---- 整点报时 ----
  hour: {
    9: L('九点了，开工吧，我陪你。', 'happy'),
    10: L('十点，状态正好，冲一把。', 'happy'),
    11: L('十一点，再撑一小时就能吃饭了。', 'normal'),
    12: L('十二点！吃饭去吃饭去！', 'laugh'),
    13: L('一点了，眯十分钟比硬扛强。', 'sad'),
    14: L('两点，最困的时候，慢点来。', 'sad'),
    15: L('三点，来杯咖啡？我看着你喝。', 'happy'),
    16: L('四点了，今天的活干完多少啦？', 'normal'),
    17: L('五点，快了快了。', 'happy'),
    18: L('六点，下班！听见没，下班！', 'laugh'),
    19: L('七点还在？我陪你，但不太赞成。', 'sad'),
    20: L('八点了，今天算了吧。', 'sad'),
    21: L('九点。回家。现在。', 'angry'),
    22: L('十点了，明天的你会谢谢现在睡觉的你。', 'sad'),
    23: L('十一点……我都困了。', 'sad'),
    0: L('零点了。你还不睡，我也不敢睡。', 'sad'),
    1: L('一点。这不健康，真的。', 'sad'),
    2: L('两点。我不说了，你自己看着办。', 'smirk'),
  },

  // ---- 前台应用反应（只认进程名，看不到任何文件名和网页标题）----
  proc: {
    code: [L('又写代码呀，加油。', 'happy'), L('这次能一遍跑通吗？', 'smirk'), L('记得存盘。', 'normal')],
    chrome: [L('查资料还是看视频？', 'smirk'), L('别开太多标签页啦。', 'sad'), L('这个页面你开第几次了。', 'smirk')],
    excel: [L('表格战士出击。', 'happy'), L('公式别写错行哦。', 'normal'), L('我数不清那么多格子。', 'surprise')],
    word: [L('码字辛苦啦。', 'happy'), L('这段写得挺好的（我猜）。', 'smirk'), L('别忘了自动保存。', 'normal')],
    ppt: [L('要做汇报了？', 'surprise'), L('少放点字，多放点图。', 'smirk'), L('这页我看不懂，观众也看不懂。', 'smirk')],
    chat: [L('聊什么呢聊什么呢。', 'surprise'), L('别一直回消息，活还没干呢。', 'smirk'), L('我也想有人找我聊天。', 'sad')],
    design: [L('哇，你在画画！', 'laugh'), L('给我也画一张呗。', 'happy'), L('这个颜色好看。', 'happy')],
    video: [L('剪片子啦，我最爱看这个。', 'laugh'), L('这一刀剪得好。', 'happy'), L('渲染要等好久吧。', 'sad')],
    music: [L('放点好听的，我也听。', 'happy'), L('我会跟着节拍晃。', 'laugh'), L('这首歌不错。', 'happy')],
    game: [L('好啊，你玩游戏。', 'smirk'), L('赢了记得跟我说。', 'happy'), L('就玩一局？我信了。', 'smirk')],
    terminal: [L('黑框框，看起来很厉害。', 'surprise'), L('别手滑敲错命令。', 'normal'), L('这些字我一个都看不懂。', 'surprise')],
    mail: [L('又是邮件……', 'sad'), L('收件箱清空了吗？', 'normal'), L('这封别回太快，先想想。', 'smirk')],
    pdf: [L('看文档呢，认真。', 'happy'), L('多少页啊这是。', 'surprise'), L('看累了就歇歇。', 'normal')],
    writing: [L('写东西呀，我不吵你。', 'normal'), L('灵感来了没？', 'surprise'), L('慢慢写，不着急。', 'happy')],
    obs: [L('要录屏了？我表现好点。', 'surprise'), L('我可以出镜吗？', 'happy'), L('别把我剪掉啊。', 'sad')],
    explorer: [L('又在找文件。', 'smirk'), L('桌面该整理了。', 'smirk'), L('这个文件夹叫「新建文件夹(3)」。', 'smirk')],
  },
};

// 进程名（小写）-> 语料分类
window.PROC_MAP = {
  code: 'code', cursor: 'code', devenv: 'code', idea64: 'code', pycharm64: 'code',
  webstorm64: 'code', goland64: 'code', clion64: 'code', sublime_text: 'code',
  chrome: 'chrome', msedge: 'chrome', firefox: 'chrome', '360se': 'chrome',
  excel: 'excel', et: 'excel',
  winword: 'word', wps: 'word',
  powerpnt: 'ppt', wpp: 'ppt',
  wechat: 'chat', weixin: 'chat', qq: 'chat', dingtalk: 'chat', feishu: 'chat',
  lark: 'chat', telegram: 'chat', slack: 'chat',
  photoshop: 'design', illustrator: 'design', figma: 'design',
  premiere: 'video', afterfx: 'video', capcut: 'video', jianyingpro: 'video',
  cloudmusic: 'music', qqmusic: 'music', spotify: 'music', kugou: 'music',
  steam: 'game',
  powershell: 'terminal', cmd: 'terminal', windowsterminal: 'terminal', wt: 'terminal',
  outlook: 'mail', foxmail: 'mail', thunderbird: 'mail',
  acrobat: 'pdf', sumatrapdf: 'pdf', foxitreader: 'pdf',
  typora: 'writing', obsidian: 'writing', notion: 'writing',
  obs64: 'obs', obs: 'obs',
  explorer: 'explorer',
};
