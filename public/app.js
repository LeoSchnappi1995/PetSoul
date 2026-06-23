const profiles = [
  {
    human: '林夕',
    pet: '糯米',
    title: '林夕 & 糯米',
    distance: '420m',
    bio: '糯米是个社交悍匪，见到飞盘会自动切换成打工模式。今晚想找一个能一起慢跑又能一起买水的人。',
    photo: 'assets/pet-dog.jpg',
    badges: ['人宠合影', '今晚可遛', '飞盘成瘾'],
    tags: ['柴犬', '滨江步道', '19:00 后', '会带湿巾']
  },
  {
    human: '阿沐',
    pet: '团子',
    title: '阿沐 & 团子',
    distance: '860m',
    bio: '团子会坐推车巡视街区，表情像房东查水表。适合找安静路线、咖啡店门口短暂停靠的搭子。',
    photo: 'assets/pet-cat.jpg',
    badges: ['人宠合影', '推车出门', '表情管理失败'],
    tags: ['布偶', '遛猫圈', '周末下午', '咖啡店友好']
  },
  {
    human: '北北',
    pet: '校长',
    title: '北北 & 校长',
    distance: '1.4km',
    bio: '鬃狮蜥校长出门只负责冷静注视全场。想找不怕蜥蜴、愿意一起晒太阳的奇怪朋友。',
    photo: 'assets/pet-lizard.jpg',
    badges: ['蜥蜴搭子', '晒太阳局', '喜剧感拉满'],
    tags: ['鬃狮蜥', '静安公园', '下午有太阳', '可围观']
  },
  {
    human: '南枝',
    pet: '慢慢',
    title: '南枝 & 慢慢',
    distance: '2.1km',
    bio: '慢慢是一只龟，主打一个不赶时间。适合找可以接受散步速度约等于冥想的人。',
    photo: 'assets/pet-tortoise.jpg',
    badges: ['乌龟出街', '低速社交', '非常稳定'],
    tags: ['陆龟', '复兴公园', '慢慢走', '不催']
  }
];

const circles = [
  {
    id: 'riverside-dog',
    type: 'dog',
    name: '徐汇滨江夜遛队',
    detail: '19:00 后最热，42 组人宠在附近',
    symbol: '狗',
    color: '#2f8c68',
    left: 29,
    top: 70,
    avatars: ['https://loremflickr.com/120/120/dog?lock=31', 'https://loremflickr.com/120/120/dog?lock=32', 'https://loremflickr.com/120/120/person,dog?lock=33']
  },
  {
    id: 'quiet-cat',
    type: 'cat',
    name: '武康路遛猫观察站',
    detail: '推车、背包、低噪路线集合',
    symbol: '猫',
    color: '#7a62b7',
    left: 39,
    top: 47,
    avatars: ['https://loremflickr.com/120/120/cat?lock=34', 'https://loremflickr.com/120/120/cat?lock=35', 'https://loremflickr.com/120/120/person,cat?lock=36']
  },
  {
    id: 'border-collie-breed',
    type: 'breed',
    name: '边牧星球',
    detail: '飞盘、接球、智商压迫感交流',
    symbol: '边',
    color: '#f48b3b',
    left: 22,
    top: 34,
    avatars: ['https://loremflickr.com/120/120/bordercollie?lock=37', 'https://loremflickr.com/120/120/dog?lock=38', 'https://loremflickr.com/120/120/dog?lock=39']
  },
  {
    id: 'reptile-club',
    type: 'reptile',
    name: '异宠晒太阳局',
    detail: '蜥蜴、龟、守宫，今天 9 位主人在线',
    symbol: '蜥',
    color: '#4384c5',
    left: 67,
    top: 41,
    avatars: ['https://loremflickr.com/120/120/lizard?lock=40', 'https://loremflickr.com/120/120/tortoise?lock=41', 'https://loremflickr.com/120/120/reptile?lock=42']
  },
  {
    id: 'maine-coon-breed',
    type: 'breed',
    name: '缅因星球',
    detail: '大猫主人互相确认家里沙发还好吗',
    symbol: '缅',
    color: '#dc5c71',
    left: 73,
    top: 62,
    avatars: ['https://loremflickr.com/120/120/mainecoon?lock=43', 'https://loremflickr.com/120/120/cat?lock=44', 'https://loremflickr.com/120/120/cat?lock=45']
  },
  {
    id: 'garden-cat-breed',
    type: 'breed',
    name: '田园猫星球',
    detail: '领养故事、绝育攻略、晒主子表情包',
    symbol: '田',
    color: '#6f8f3d',
    left: 54,
    top: 25,
    avatars: ['https://loremflickr.com/120/120/cat?lock=46', 'https://loremflickr.com/120/120/cat?lock=47', 'https://loremflickr.com/120/120/cat?lock=48']
  }
];

const planets = [
  {
    name: '边牧星球',
    detail: '飞盘局 12 场',
    color: '#f48b3b',
    avatars: ['https://loremflickr.com/120/120/bordercollie?lock=51', 'https://loremflickr.com/120/120/dog?lock=52']
  },
  {
    name: '缅因星球',
    detail: '大猫家庭 328 个',
    color: '#dc5c71',
    avatars: ['https://loremflickr.com/120/120/mainecoon?lock=53', 'https://loremflickr.com/120/120/cat?lock=54']
  },
  {
    name: '田园猫星球',
    detail: '今日新增 46 张表情包',
    color: '#6f8f3d',
    avatars: ['https://loremflickr.com/120/120/cat?lock=55', 'https://loremflickr.com/120/120/cat?lock=56']
  }
];

const chats = [
  {
    name: '林夕 & 糯米',
    time: '刚刚',
    text: '糯米已经到楼下草坪了，问你们出门了吗？',
    avatar: 'assets/pet-dog.jpg'
  },
  {
    name: '阿沐 & 团子',
    time: '19:12',
    text: '团子今天愿意出门，但只接受安静路线。',
    avatar: 'assets/pet-cat.jpg'
  },
  {
    name: '北北 & 校长',
    time: '昨天',
    text: '校长已经趴在窗台晒太阳，正在等一个严肃围观群众。',
    avatar: 'assets/pet-lizard.jpg'
  }
];

const state = {
  view: 'petinder',
  profileIndex: 0,
  ring: 'all',
  bombCount: 0,
  dragStartX: 0,
  dragCurrentX: 0,
  dragging: false
};

const viewMeta = {
  petinder: ['Petinder', '今晚一起遛吗'],
  planet: ['Pet 星球', '附近的遛宠圈'],
  messages: ['消息', '宠友消息']
};

const views = document.querySelectorAll('.view');
const tabs = document.querySelectorAll('.tab');
const modes = document.querySelectorAll('.mode');
const chips = document.querySelectorAll('.chip');
const petCard = document.querySelector('#petCard');
const toast = document.querySelector('#toast');
const bombOverlay = document.querySelector('#bombOverlay');
const bombCopy = document.querySelector('#bombCopy');
let activeBombChat = null;

document.querySelector('#passBtn').addEventListener('click', () => swipeProfile('left'));
document.querySelector('#likeBtn').addEventListener('click', () => swipeProfile('right'));
document.querySelector('#waveBtn').addEventListener('click', () => showToast('已发送散步邀约'));
document.querySelector('#joinWalkBtn').addEventListener('click', () => showToast('已加入今晚慢遛局'));
document.querySelector('#filterBtn').addEventListener('click', () => showToast('筛选：距离、体型、出门时间'));
document.querySelector('#profileBtn').addEventListener('click', () => showToast('你的宠物主页：待完善'));
document.querySelector('#apologyBtn').addEventListener('click', () => resolveBomb('爸爸错了'));
document.querySelector('#walkedBtn').addEventListener('click', () => resolveBomb('遛了遛了'));
bombOverlay.addEventListener('click', (event) => {
  if (event.target === bombOverlay) closeBomb();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateView(tab.dataset.view));
});

modes.forEach((mode) => {
  mode.addEventListener('click', () => {
    modes.forEach((item) => item.classList.toggle('active', item === mode));
    showToast(`${mode.textContent}匹配已启用`);
  });
});

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    state.ring = chip.dataset.ring;
    chips.forEach((item) => item.classList.toggle('active', item === chip));
    renderMap();
  });
});

petCard.addEventListener('pointerdown', startDrag);
window.addEventListener('pointermove', moveDrag);
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

renderProfile();
renderPlanets();
renderMap();
renderChats();

function activateView(name) {
  state.view = name;
  views.forEach((view) => view.classList.toggle('active', view.id === `view-${name}`));
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === name));
  const [kicker, title] = viewMeta[name];
  document.querySelector('#viewKicker').textContent = kicker;
  document.querySelector('#viewTitle').textContent = title;
}

function renderProfile() {
  const profile = profiles[state.profileIndex % profiles.length];
  document.querySelector('#profilePhoto').src = profile.photo;
  document.querySelector('#profilePhoto').alt = `${profile.human} 和 ${profile.pet} 的合影`;
  document.querySelector('#profileName').textContent = profile.title;
  document.querySelector('#distanceText').textContent = profile.distance;
  document.querySelector('#profileBio').textContent = profile.bio;
  document.querySelector('#cardBadges').innerHTML = profile.badges
    .map((badge) => `<span class="badge">${badge}</span>`)
    .join('');
  document.querySelector('#tagRow').innerHTML = profile.tags
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join('');
}

function swipeProfile(direction) {
  petCard.classList.add(direction === 'left' ? 'exit-left' : 'exit-right');
  const current = profiles[state.profileIndex % profiles.length];
  window.setTimeout(() => {
    state.profileIndex += 1;
    renderProfile();
    petCard.classList.remove('exit-left', 'exit-right', 'drag-like', 'drag-nope');
    petCard.style.transform = '';
    petCard.style.setProperty('--drag-progress', 0);
    petCard.style.setProperty('--stamp-opacity', 0);
    if (direction === 'right') {
      showToast(`已想和 ${current.pet} 一起遛`);
    }
  }, 260);
}

function startDrag(event) {
  state.dragging = true;
  state.dragStartX = event.clientX;
  state.dragCurrentX = event.clientX;
  petCard.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
  if (!state.dragging) return;
  state.dragCurrentX = event.clientX;
  const offset = state.dragCurrentX - state.dragStartX;
  const rotate = Math.max(-10, Math.min(10, offset / 18));
  const progress = Math.min(1, Math.abs(offset) / 120);
  petCard.style.transform = `translateX(${offset}px) rotate(${rotate}deg)`;
  petCard.style.setProperty('--drag-progress', progress.toFixed(2));
  petCard.style.setProperty('--stamp-opacity', (0.25 + progress * 0.75).toFixed(2));
  petCard.classList.toggle('drag-like', offset > 24);
  petCard.classList.toggle('drag-nope', offset < -24);
}

function endDrag() {
  if (!state.dragging) return;
  const offset = state.dragCurrentX - state.dragStartX;
  state.dragging = false;
  state.dragStartX = 0;
  state.dragCurrentX = 0;
  if (offset > 96) {
    swipeProfile('right');
    return;
  }
  if (offset < -96) {
    swipeProfile('left');
    return;
  }
  petCard.style.transform = '';
  petCard.style.setProperty('--drag-progress', 0);
  petCard.style.setProperty('--stamp-opacity', 0);
  petCard.classList.remove('drag-like', 'drag-nope');
}

function renderPlanets() {
  const banner = document.querySelector('.planet-banner');
  banner.innerHTML = planets
    .map((planet) => `
      <button class="planet-card" type="button" style="--planet-color: ${planet.color}">
        <span class="planet-orbit"></span>
        <span>
          <strong>${planet.name}</strong>
          <em>${planet.detail}</em>
        </span>
        <span class="avatar-stack">${renderAvatarStack(planet.avatars)}</span>
      </button>
    `)
    .join('');
  banner.querySelectorAll('.planet-card').forEach((card, index) => {
    card.addEventListener('click', () => {
      state.ring = 'breed';
      chips.forEach((chip) => chip.classList.toggle('active', chip.dataset.ring === 'breed'));
      renderMap();
      showToast(`已进入${planets[index].name}`);
    });
  });
}

function renderMap() {
  const mapBoard = document.querySelector('#mapBoard');
  mapBoard.querySelectorAll('.map-pin').forEach((pin) => pin.remove());
  const visible = getVisibleCircles();

  circles.forEach((circle) => {
    const pin = document.createElement('button');
    pin.className = `map-pin ${visible.includes(circle) ? 'active' : ''}`;
    pin.type = 'button';
    pin.style.left = `${circle.left}%`;
    pin.style.top = `${circle.top}%`;
    pin.style.setProperty('--pin-color', circle.color);
    pin.setAttribute('aria-label', circle.name);
    pin.innerHTML = renderAvatarStack(circle.avatars);
    pin.addEventListener('click', () => {
      state.ring = circle.type;
      chips.forEach((chip) => chip.classList.toggle('active', chip.dataset.ring === circle.type));
      renderMap();
      showToast(circle.name);
    });
    mapBoard.appendChild(pin);
  });

  renderCircleList(visible);
}

function renderCircleList(visible) {
  const list = document.querySelector('#circleList');
  list.innerHTML = '';
  visible.forEach((circle) => {
    const item = document.createElement('article');
    item.className = 'circle-card';
    item.innerHTML = `
      <span class="circle-icon" style="--pin-color: ${circle.color}">${renderAvatarStack(circle.avatars)}</span>
      <div>
        <h3>${circle.name}</h3>
        <p>${circle.detail}</p>
      </div>
      <button type="button">进圈</button>
    `;
    item.querySelector('button').addEventListener('click', () => showToast(`已进入${circle.name}`));
    list.appendChild(item);
  });
}

function renderAvatarStack(avatars = []) {
  return avatars
    .slice(0, 3)
    .map((avatar) => `<img src="${avatar}" alt="" />`)
    .join('');
}

function getVisibleCircles() {
  if (state.ring === 'all') return circles;
  return circles.filter((circle) => circle.type === state.ring);
}

function renderChats() {
  const list = document.querySelector('#chatList');
  list.innerHTML = '';
  chats.forEach((chat) => {
    const item = document.createElement('article');
    item.className = 'chat-item';
    item.innerHTML = `
      <img class="chat-avatar" src="${chat.avatar}" alt="${chat.name}" />
      <div>
        <div class="chat-head">
          <h3>${chat.name}</h3>
          <span>${chat.time}</span>
        </div>
        <p>${chat.text}</p>
        <div class="bomb-row">
          <button type="button" class="walk-bomb" data-text="遛了么">遛了么</button>
        </div>
      </div>
    `;
    item.querySelectorAll('.bomb-row button').forEach((button) => {
      button.addEventListener('click', () => sendBomb(button, chat));
    });
    list.appendChild(item);
  });
}

function sendBomb(button, chat) {
  state.bombCount += 1;
  activeBombChat = chat;
  button.classList.add('sent');
  button.textContent = '已轰';
  document.querySelector('#bombCount').textContent = state.bombCount;
  bombCopy.textContent = `${chat.name} 的小狗正在发射怒视：${button.dataset.text}？`;
  bombOverlay.classList.add('show');
  bombOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bombing');
}

function resolveBomb(answer) {
  if (activeBombChat) {
    showToast(`${activeBombChat.name}：${answer}`);
  }
  closeBomb();
}

function closeBomb() {
  bombOverlay.classList.remove('show');
  bombOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bombing');
  activeBombChat = null;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 1600);
}
