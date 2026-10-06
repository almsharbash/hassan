const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const toast = (message) => {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window.__kalimatToast);
  window.__kalimatToast = setTimeout(() => el.classList.remove('show'), 1800);
};

const publishDialog = $('#publishDialog');
const publishBtn = $('#publishBtn');

publishBtn?.addEventListener('click', () => {
  if (typeof publishDialog?.showModal === 'function') publishDialog.showModal();
  else publishDialog?.setAttribute('open','');
});

$$('.close').forEach(btn => btn.addEventListener('click', () => {
  publishDialog?.close?.();
}));

$$('.like').forEach(btn => {
  btn.addEventListener('click', () => {
    const liked = btn.classList.toggle('liked');
    const icon = $('b', btn);
    if (icon) icon.textContent = liked ? '♥' : '♡';
    const count = $('span', btn);
    if (count && !count.dataset.base) count.dataset.base = count.textContent;
    toast(liked ? 'أُعجبت بالكلمة' : 'تم إلغاء الإعجاب');
  });
});

$$('.save').forEach(btn => {
  btn.addEventListener('click', () => {
    const saved = btn.classList.toggle('saved');
    const icon = $('b', btn);
    if (icon) icon.textContent = saved ? '◆' : '⌑';
    toast(saved ? 'تم الحفظ' : 'أُلغي الحفظ');
  });
});

$$('.comments').forEach(btn => {
  btn.addEventListener('click', () => toast('التعليقات ستُفعّل مع قاعدة البيانات'));
});

$$('.action').forEach(btn => {
  if (btn.classList.contains('like') || btn.classList.contains('save') || btn.classList.contains('comments')) return;
  btn.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({title:'kalimat', text:'شاهد هذه الكلمة على kalimat'});
      } else {
        await navigator.clipboard.writeText(location.href);
        toast('تم نسخ رابط المنصة');
      }
    } catch {}
  });
});

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    toast(tab.textContent.trim() === 'المتابعون' ? 'محتوى المتابعين قريبًا' : 'أنت في صفحة لك');
  });
});

$$('.nav').forEach(nav => {
  nav.addEventListener('click', () => {
    $$('.nav').forEach(n => n.classList.remove('active'));
    nav.classList.add('active');
    const label = $('span', nav)?.textContent?.trim();
    if (label && label !== 'الرئيسية') toast(`${label} ستُفعّل في المرحلة التالية`);
  });
});

$('#searchBtn')?.addEventListener('click', () => toast('البحث سيُفعّل مع قاعدة البيانات'));
$('#profileBtn')?.addEventListener('click', () => toast('الحسابات ستُفعّل في المرحلة التالية'));
$('#meNav')?.addEventListener('click', () => toast('صفحة الحساب ستُفعّل مع نظام المستخدمين'));

$('.primary')?.addEventListener('click', (e) => {
  const text = $('textarea')?.value.trim();
  if (!text) {
    e.preventDefault();
    toast('اكتب كلمة قبل النشر');
    return;
  }
  e.preventDefault();
  publishDialog?.close?.();
  $('textarea').value = '';
  toast('تم تجهيز المنشور — الربط بالخادم في الخطوة التالية');
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const video = $('video', entry.target);
    if (!video) return;
    if (entry.isIntersecting && entry.intersectionRatio > .65) {
      video.play?.().catch(()=>{});
    } else {
      video.pause?.();
    }
  });
}, {threshold:[.2,.65,.9]});

$$('.post').forEach(post => observer.observe(post));

// Keep the feed feeling like a mobile Reels/TikTok experience.
$('#feed')?.addEventListener('scroll', () => {
  // Intentionally light: snap is handled by CSS.
}, {passive:true});

console.log('kalimat UI v4 ready');
