(() => {
"use strict";
const $ = id => document.getElementById(id);
const cfg = window.KALIMAT_CONFIG || {};
const demo = !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT") || !cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_PUBLISHABLE_KEY.includes("YOUR_KEY");
const sb = !demo && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;

const state = {
  user:null, profile:null, theme:localStorage.getItem("kalimat.theme") || "dark",
  feedMode:"for-you", posts:[], media:null, commentPost:null, chatUser:null, chatChannel:null,
  blocked:new Set(), followState:new Map()
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const toast = (m) => { $("toast").textContent=m; $("toast").classList.remove("hidden"); clearTimeout(toast.t); toast.t=setTimeout(()=>$("toast").classList.add("hidden"),3000); };
const open = id => $(id).showModal();
const close = id => $(id).close();
const avatar = p => p?.avatar_url || "./icon-192.png";
const nameOf = p => p?.display_name || p?.username || p?.email?.split("@")[0] || "عضو كلمات";

function applyTheme(){
  document.body.classList.toggle("light", state.theme==="light");
  localStorage.setItem("kalimat.theme", state.theme);
  $("theme-label").textContent = state.theme==="light" ? "مضيء" : "داكن";
}
applyTheme();

function authMessage(msg){ $("auth-note").textContent=msg || ""; }

async function init(){
  setTimeout(()=>$("boot").classList.add("hidden"),500);
  if(demo){
    $("auth").classList.remove("hidden");
    authMessage("ضع بيانات Supabase في supabase-config.js لتفعيل الحسابات الحقيقية والبريد الموثق والدردشة.");
    return;
  }
  const {data:{session}} = await sb.auth.getSession();
  await onSession(session);
  sb.auth.onAuthStateChange((_event, session) => setTimeout(()=>onSession(session),0));
}

async function onSession(session){
  state.user=session?.user || null;
  if(!state.user){ $("app").classList.add("hidden"); $("auth").classList.remove("hidden"); return; }
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  await loadProfile();
  await loadBlocked();
  updateHeader();
  await loadFeed();
  subscribeNotifications();
}

async function loadProfile(){
  const {data,error}=await sb.from("profiles").select("*").eq("id",state.user.id).maybeSingle();
  if(error) return console.error(error);
  if(!data){
    const username = (state.user.email?.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g,"").slice(0,24) || "user";
    const {data:p} = await sb.from("profiles").insert({id:state.user.id,display_name:username,username}).select().single();
    state.profile=p;
  } else state.profile=data;
}
async function loadBlocked(){
  const {data}=await sb.from("blocks").select("blocked_id").eq("blocker_id",state.user.id);
  state.blocked=new Set((data||[]).map(x=>x.blocked_id));
}
function updateHeader(){ $("header-avatar").src=avatar(state.profile); }

async function loadFeed(){
  if(demo){ renderDemoFeed(); return; }
  let q=sb.from("posts").select("id,user_id,text,media_url,media_type,created_at,profiles(id,display_name,username,avatar_url)").order("created_at",{ascending:false}).limit(40);
  if(state.feedMode==="following"){
    const {data:follows}=await sb.from("follows").select("following_id").eq("follower_id",state.user.id).eq("status","accepted");
    const ids=(follows||[]).map(x=>x.following_id);
    if(!ids.length){ state.posts=[]; renderFeed(); return; }
    q=q.in("user_id",ids);
  }
  const {data,error}=await q;
  if(error){toast("تعذر تحميل المنشورات."); console.error(error);return;}
  state.posts=(data||[]).filter(p=>!state.blocked.has(p.user_id));
  renderFeed();
}
function renderDemoFeed(){
  state.posts=[{id:"demo-1",user_id:"demo",text:"مساحة للكلمة، للفكرة، وللصورة التي تستحق أن تُرى.",media_url:"",media_type:"text",created_at:new Date().toISOString(),profiles:{display_name:"kalimat",username:"kalimat",avatar_url:"./icon-192.png"}},{id:"demo-2",user_id:"demo",text:"الفكرة تبدأ بكلمة.",media_url:"",media_type:"text",created_at:new Date().toISOString(),profiles:{display_name:"kalimat",username:"kalimat",avatar_url:"./icon-192.png"}}];
  renderFeed();
}
async function renderFeed(){
  if(!state.posts.length){ $("feed").innerHTML='<div class="post"><div class="media-placeholder"><img src="./icon-192.png" alt=""><div>لا توجد منشورات بعد. كن أول من يشارك كلمة.</div></div></div>'; return; }
  const html=[];
  for(const p of state.posts){
    let counts={likes:0,comments:0,saved:false,liked:false};
    if(sb && !demo){
      const [l,c,s]=await Promise.all([
        sb.from("likes").select("user_id",{count:"exact",head:true}).eq("post_id",p.id),
        sb.from("comments").select("id",{count:"exact",head:true}).eq("post_id",p.id),
        sb.from("saves").select("post_id",{count:"exact",head:true}).eq("post_id",p.id).eq("user_id",state.user.id)
      ]);
      counts.likes=l.count||0; counts.comments=c.count||0; counts.saved=(s.count||0)>0;
    }
    const media=p.media_url ? (p.media_type?.startsWith("video") ? `<video src="${esc(p.media_url)}" playsinline muted loop preload="metadata"></video>` : `<img src="${esc(p.media_url)}" alt="">`) : `<div class="media-placeholder"><img src="${avatar(p.profiles)}" alt=""><div class="demo-word">كلمات</div></div>`;
    html.push(`<article class="post" data-post="${esc(p.id)}">
      <div class="media">${media}</div><div class="shade"></div>
      <div class="actions">
        <button class="action like" data-id="${esc(p.id)}"><i class="fa-regular fa-heart"></i><span>${counts.likes}</span></button>
        <button class="action comment" data-id="${esc(p.id)}"><i class="fa-regular fa-comment-dots"></i><span>${counts.comments}</span></button>
        <button class="action save ${counts.saved?'active':''}" data-id="${esc(p.id)}"><i class="fa-regular fa-bookmark"></i><span>حفظ</span></button>
        <button class="action share" data-id="${esc(p.id)}"><i class="fa-solid fa-arrow-up-from-bracket"></i><span>مشاركة</span></button>
      </div>
      <div class="post-info">
        <button class="author-row profile-link" data-user="${esc(p.user_id)}"><img src="${avatar(p.profiles)}" alt=""><span class="author-name">${esc(nameOf(p.profiles))}<span class="verified">●</span></span></button>
        <h2>${esc(p.text||"")}</h2>
        <p class="hashtags">#كلمات #أفكار #إبداع</p>
      </div>
    </article>`);
  }
  $("feed").innerHTML=html.join("");
  document.querySelectorAll(".post video").forEach(v=>{
    const obs=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting?v.play().catch(()=>{}):v.pause()),{threshold:.7});
    obs.observe(v);
  });
}
async function toggleLike(id,btn){
  if(demo) return toast("الإعجاب سيصبح حقيقيًا بعد ربط Supabase.");
  const {data}=await sb.from("likes").select("post_id").eq("post_id",id).eq("user_id",state.user.id).maybeSingle();
  if(data) await sb.from("likes").delete().eq("post_id",id).eq("user_id",state.user.id);
  else await sb.from("likes").insert({post_id:id,user_id:state.user.id});
  await loadFeed();
}
async function toggleSave(id,btn){
  if(demo) return toast("الحفظ سيصبح حقيقيًا بعد ربط Supabase.");
  const {data}=await sb.from("saves").select("post_id").eq("post_id",id).eq("user_id",state.user.id).maybeSingle();
  if(data) await sb.from("saves").delete().eq("post_id",id).eq("user_id",state.user.id);
  else await sb.from("saves").insert({post_id:id,user_id:state.user.id});
  btn.classList.toggle("active",!data);
}
async function publish(){
  const text=$("post-text").value.trim(), file=$("media-file").files?.[0];
  if(!text && !file) return toast("اكتب شيئًا أو أرفق صورة/فيديو.");
  if(demo) return toast("أولاً اربط Supabase، ثم يصبح النشر حقيقيًا.");
  const b=$("publish-post"); b.disabled=true;
  try{
    let media_url=null, media_type=null;
    if(file){
      if(file.size>50*1024*1024) throw Error("الملف أكبر من 50MB.");
      const path=`${state.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g,"_")}`;
      const up=await sb.storage.from(cfg.MEDIA_BUCKET||"kalimat-media").upload(path,file,{upsert:false,contentType:file.type});
      if(up.error) throw up.error;
      const pub=sb.storage.from(cfg.MEDIA_BUCKET||"kalimat-media").getPublicUrl(path);
      media_url=pub.data.publicUrl; media_type=file.type;
    }
    const {error}=await sb.from("posts").insert({user_id:state.user.id,text,media_url,media_type});
    if(error) throw error;
    $("post-text").value=""; $("media-file").value=""; $("media-preview").classList.add("hidden"); close("publish-dialog"); toast("تم نشر الكلمة بنجاح."); await loadFeed();
  }catch(e){toast(e.message||"تعذر النشر.")}finally{b.disabled=false}
}
async function openComments(id){
  state.commentPost=id; $("comments-list").innerHTML="<div class='muted'>جاري التحميل...</div>"; open("comments-dialog");
  if(demo){$("comments-list").innerHTML="<div class='comment'>كن أول من يكتب تعليقًا.</div>";return}
  const {data}=await sb.from("comments").select("id,text,created_at,profiles(display_name,avatar_url)").eq("post_id",id).order("created_at",{ascending:true});
  $("comments-list").innerHTML=(data||[]).map(c=>`<div class="comment"><b>${esc(nameOf(c.profiles))}</b><div>${esc(c.text)}</div></div>`).join("")||"<div class='muted'>لا توجد تعليقات.</div>";
}
async function sendComment(e){
  e.preventDefault(); const text=$("comment-text").value.trim(); if(!text||!state.commentPost)return;
  if(demo)return toast("التعليقات تصبح حقيقية بعد ربط Supabase.");
  const {error}=await sb.from("comments").insert({post_id:state.commentPost,user_id:state.user.id,text});
  if(error)return toast(error.message);
  $("comment-text").value=""; await openComments(state.commentPost);
}
async function sharePost(id){
  const url=location.href.split("#")[0]+"#post-"+id;
  try{if(navigator.share) await navigator.share({title:"Kalimat",text:"منشور على كلمات",url}); else {await navigator.clipboard.writeText(url);toast("تم نسخ الرابط.");}}catch{}
}

async function openUserProfile(uid){
  if(uid===state.user?.id){ $("profile-view").innerHTML=profileHtml(state.profile,true); showPage("profile"); return; }
  if(demo){showProfileDialog({id:uid,display_name:"عضو كلمات",username:"kalimat",avatar_url:"./icon-192.png",bio:"مساحة للفكرة والكلمة."});return}
  const {data:p}=await sb.from("profiles").select("*").eq("id",uid).single();
  if(p) showProfileDialog(p);
}
function profileHtml(p,self=false){
  return `<div class="profile-hero"><img src="${avatar(p)}" alt=""><h2>${esc(nameOf(p))}</h2><div class="muted">@${esc(p.username||"member")}</div><p class="profile-bio">${esc(p.bio||"لا توجد نبذة بعد.")}</p>
  <div class="profile-stats"><span><b>—</b><small>متابعون</small></span><span><b>—</b><small>متابَعون</small></span><span><b>—</b><small>منشورات</small></span></div>
  <div class="profile-actions">${self?'<button class="primary" id="profile-edit-inline">تعديل الملف</button><button class="secondary-btn" id="settings-inline">الإعدادات</button>':'<button class="primary" id="profile-follow">متابعة</button><button class="secondary-btn" id="profile-chat">دردشة</button><button class="secondary-btn" id="profile-more">المزيد</button>'}</div></div>`;
}
function showProfileDialog(p){ $("user-profile").innerHTML=profileHtml(p,false); $("user-profile").dataset.uid=p.id; open("profile-dialog"); }

async function followUser(uid){
  if(demo)return toast("المتابعة الحقيقية تحتاج ربط Supabase.");
  if(state.blocked.has(uid))return toast("لا يمكن المتابعة بسبب الحظر.");
  const {data}=await sb.from("follows").select("status").eq("follower_id",state.user.id).eq("following_id",uid).maybeSingle();
  if(data){return toast(data.status==="pending"?"الطلب قيد الانتظار.":data.status==="accepted"?"أنت تتابع هذا العضو بالفعل.":"");}
  const {error}=await sb.from("follows").insert({follower_id:state.user.id,following_id:uid,status:"pending"});
  if(error)return toast(error.message); toast("أُرسل طلب المتابعة."); $("profile-follow").textContent="قيد الانتظار";
}
async function blockUser(uid){
  if(demo)return toast("الحظر الحقيقي يحتاج ربط Supabase.");
  await sb.from("blocks").upsert({blocker_id:state.user.id,blocked_id:uid});
  await sb.from("follows").delete().or(`and(follower_id.eq.${state.user.id},following_id.eq.${uid}),and(follower_id.eq.${uid},following_id.eq.${state.user.id})`);
  state.blocked.add(uid); close("profile-dialog"); await loadFeed(); toast("تم حظر العضو.");
}
async function unblockUser(uid){
  if(demo)return toast("الحظر الحقيقي يحتاج ربط Supabase.");
  await sb.from("blocks").delete().eq("blocker_id",state.user.id).eq("blocked_id",uid);
  state.blocked.delete(uid); toast("تم رفع الحظر."); openBlocked();
}
async function openRequests(){
  if(demo)return showGeneric("طلبات المتابعة",'<div class="result-card">بعد ربط Supabase ستظهر هنا الطلبات الحقيقية مع قبول/رفض.</div>');
  const {data}=await sb.from("follows").select("id,follower_id,created_at,profiles!follows_follower_id_fkey(display_name,username,avatar_url)").eq("following_id",state.user.id).eq("status","pending").order("created_at",{ascending:false});
  showGeneric("طلبات المتابعة",(data||[]).map(r=>`<div class="result-card row between"><div class="row"><img class="avatar" src="${avatar(r.profiles)}"><span><b>${esc(nameOf(r.profiles))}</b><small class="muted">@${esc(r.profiles?.username||"")}</small></span></div><div class="profile-actions"><button class="primary accept-follow" data-id="${r.id}">قبول</button><button class="secondary-btn reject-follow" data-id="${r.id}">رفض</button></div></div>`).join("")||"<div class='result-card'>لا توجد طلبات جديدة.</div>");
}
async function decideFollow(id,status){
  const {error}=await sb.from("follows").update({status}).eq("id",id).eq("following_id",state.user.id); if(error)toast(error.message); else {toast(status==="accepted"?"تم قبول الطلب.":"تم رفض الطلب.");openRequests();}
}
async function openBlocked(){
  if(demo)return showGeneric("المحظورون",'<div class="result-card">ستظهر هنا قائمة المحظورين بعد ربط Supabase.</div>');
  const {data}=await sb.from("blocks").select("blocked_id,profiles!blocks_blocked_id_fkey(display_name,username,avatar_url)").eq("blocker_id",state.user.id);
  showGeneric("المحظورون",(data||[]).map(x=>`<div class="result-card row between"><div class="row"><img class="avatar" src="${avatar(x.profiles)}"><b>${esc(nameOf(x.profiles))}</b></div><button class="secondary-btn unblock" data-id="${x.blocked_id}">رفع الحظر</button></div>`).join("")||"<div class='result-card'>لا يوجد أعضاء محظورون.</div>");
}
function showGeneric(title,content){$("generic-content").innerHTML=`<h2>${title}</h2>${content}`;open("generic-dialog");}

async function openChat(uid=null){
  if(demo)return showGeneric("الدردشة",'<div class="result-card">الدردشة الفورية ستعمل بعد ربط Supabase Realtime.</div>');
  close("settings-dialog"); state.chatUser=uid; open("chat-dialog"); await loadChatUsers(); if(uid) await selectChatUser(uid);
}
async function loadChatUsers(){
  const {data}=await sb.from("follows").select("following_id,profiles!follows_following_id_fkey(id,display_name,username,avatar_url)").eq("follower_id",state.user.id).eq("status","accepted");
  $("chat-users").innerHTML=(data||[]).map(x=>`<button class="chat-user" data-chat-user="${x.following_id}"><div class="row"><img class="avatar" src="${avatar(x.profiles)}"><b>${esc(nameOf(x.profiles))}</b></div></button>`).join("")||"<div class='muted'>لا توجد محادثات بعد. تابع أشخاصًا ثم ابدأ الدردشة.</div>";
}
async function selectChatUser(uid){
  state.chatUser=uid; document.querySelectorAll(".chat-user").forEach(x=>x.classList.toggle("active",x.dataset.chatUser===uid));
  const {data:u}=await sb.from("profiles").select("*").eq("id",uid).single(); $("chat-with").textContent=nameOf(u);
  await loadMessages();
  if(state.chatChannel) sb.removeChannel(state.chatChannel);
  state.chatChannel=sb.channel("chat:"+[state.user.id,uid].sort().join(":")).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`conversation_id=eq.${conversationId(uid)}`},()=>loadMessages()).subscribe();
}
const conversationId=uid=>[state.user.id,uid].sort().join("_");
async function loadMessages(){
  if(!state.chatUser)return;
  const {data}=await sb.from("messages").select("id,sender_id,body,created_at").eq("conversation_id",conversationId(state.chatUser)).order("created_at",{ascending:true}).limit(100);
  $("chat-messages").innerHTML=(data||[]).map(m=>`<div class="message ${m.sender_id===state.user.id?'mine':''}">${esc(m.body)}</div>`).join("");
  $("chat-messages").scrollTop=$("chat-messages").scrollHeight;
}
async function sendMessage(e){
  e.preventDefault(); const body=$("chat-input").value.trim(); if(!body||!state.chatUser)return;
  const {error}=await sb.from("messages").insert({conversation_id:conversationId(state.chatUser),sender_id:state.user.id,receiver_id:state.chatUser,body});
  if(error)toast(error.message); else {$("chat-input").value="";loadMessages();}
}

async function saveProfile(){
  const name=$("edit-name").value.trim(), bio=$("edit-bio").value.trim(), file=$("edit-avatar-file")?.files?.[0];
  if(name.length<2)return toast("الاسم قصير جدًا.");
  let avatar_url=state.profile?.avatar_url||null;
  try{
    if(file){
      const path=`${state.user.id}/avatar-${crypto.randomUUID()}.${(file.name.split(".").pop()||"jpg").replace(/[^a-z0-9]/gi,"")}`;
      const up=await sb.storage.from(cfg.MEDIA_BUCKET||"kalimat-media").upload(path,file,{upsert:false,contentType:file.type});
      if(up.error)throw up.error;
      avatar_url=sb.storage.from(cfg.MEDIA_BUCKET||"kalimat-media").getPublicUrl(path).data.publicUrl;
    }
    const {error}=await sb.from("profiles").update({display_name:name,bio,avatar_url}).eq("id",state.user.id);
    if(error)throw error;
    state.profile={...state.profile,display_name:name,bio,avatar_url}; updateHeader(); close("generic-dialog"); toast("تم حفظ الملف.");
  }catch(e){toast(e.message||"تعذر حفظ الملف.")}
}
function openEditProfile(){
  showGeneric("تعديل الملف الشخصي",`<form id="edit-profile-form">
    <div class="avatar-edit"><img id="edit-avatar-preview" class="avatar big" src="${avatar(state.profile)}"><input id="edit-avatar-file" type="file" accept="image/*" hidden><button type="button" class="secondary-btn" id="edit-avatar-pick">تغيير الصورة</button></div>
    <input id="edit-name" class="field" value="${esc(state.profile?.display_name||"")}" placeholder="الاسم الظاهر">
    <textarea id="edit-bio" class="field" style="height:120px" maxlength="500" placeholder="نبذة قصيرة">${esc(state.profile?.bio||"")}</textarea>
    <button class="primary wide">حفظ التغييرات</button></form>`);
  $("edit-avatar-pick").onclick=()=>$("edit-avatar-file").click();
  $("edit-avatar-file").onchange=()=>{
    const f=$("edit-avatar-file").files?.[0]; if(!f)return;
    if(!f.type.startsWith("image/"))return toast("اختر صورة فقط.");
    if(f.size>5*1024*1024)return toast("الصورة أكبر من 5MB.");
    $("edit-avatar-preview").src=URL.createObjectURL(f);
  };
  $("edit-profile-form").onsubmit=e=>{e.preventDefault();saveProfile()};
}
function openPrivacy(){
  showGeneric("الخصوصية والأمان",`<div class="setting-section"><div class="setting-row"><span><b>طلبات المتابعة</b><p>الحسابات الجديدة ترسل طلبًا قبل المتابعة.</p></span><i class="fa-solid fa-user-plus"></i></div>
  <div class="setting-row"><span><b>الرسائل</b><p>الدردشة متاحة لمن تتابعهم بعد قبول المتابعة.</p></span><i class="fa-regular fa-message"></i></div>
  <div class="setting-row"><span><b>البريد الموثق</b><p>الحسابات تستخدم بريدًا حقيقيًا مع تأكيد البريد عبر Supabase Auth.</p></span><i class="fa-solid fa-envelope-circle-check"></i></div></div>`);
}

function showPage(p){
  if(p==="home"){ $("page-explore").classList.add("hidden");$("page-notifications").classList.add("hidden");$("page-profile").classList.add("hidden");$("feed").classList.remove("hidden");}
  if(p==="explore"){ $("feed").classList.add("hidden");$("page-notifications").classList.add("hidden");$("page-profile").classList.add("hidden");$("page-explore").classList.remove("hidden");}
  if(p==="notifications"){ $("feed").classList.add("hidden");$("page-explore").classList.add("hidden");$("page-profile").classList.add("hidden");$("page-notifications").classList.remove("hidden");loadNotifications();}
  if(p==="profile"){ $("feed").classList.add("hidden");$("page-explore").classList.add("hidden");$("page-notifications").classList.add("hidden");$("page-profile").classList.remove("hidden");$("profile-view").innerHTML=profileHtml(state.profile,true);}
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===p));
}
async function loadNotifications(){
  if(demo){$("notifications-list").innerHTML='<div class="notification">الإشعارات الحقيقية ستعمل بعد ربط Supabase.</div>';return}
  const {data}=await sb.from("notifications").select("id,type,text,read,created_at").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(50);
  $("notifications-list").innerHTML=(data||[]).map(n=>`<div class="notification ${n.read?'':'unread'}"><b>${esc(n.text||notificationText(n.type))}</b><small class="muted">${new Date(n.created_at).toLocaleString("ar")}</small></div>`).join("")||"<div class='notification'>لا توجد إشعارات.</div>";
}
function notificationText(t){return ({follow_request:"لديك طلب متابعة جديد.",follow_accepted:"تم قبول طلب المتابعة.",message:"لديك رسالة جديدة."}[t]||"لديك إشعار جديد.");}
function subscribeNotifications(){
  if(demo)return;
  sb.channel("notif:"+state.user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${state.user.id}`},()=>{ $("notif-dot").style.display="block"; }).subscribe();
}

document.addEventListener("click", async e=>{
  const feedTab=e.target.closest(".feed-tab"); if(feedTab){state.feedMode=feedTab.dataset.feed;document.querySelectorAll(".feed-tab").forEach(x=>x.classList.toggle("active",x===feedTab));await loadFeed();return}
  const nav=e.target.closest(".nav-btn"); if(nav){showPage(nav.dataset.page);return}
  const like=e.target.closest(".like"); if(like){toggleLike(like.dataset.id,like);return}
  const save=e.target.closest(".save"); if(save){toggleSave(save.dataset.id,save);return}
  const comment=e.target.closest(".comment"); if(comment){openComments(comment.dataset.id);return}
  const share=e.target.closest(".share"); if(share){sharePost(share.dataset.id);return}
  const prof=e.target.closest(".profile-link,[data-user]"); if(prof && !e.target.closest(".accept-follow,.reject-follow,.unblock")){openUserProfile(prof.dataset.user);return}
  const accept=e.target.closest(".accept-follow"); if(accept){decideFollow(accept.dataset.id,"accepted");return}
  const reject=e.target.closest(".reject-follow"); if(reject){decideFollow(reject.dataset.id,"rejected");return}
  const unblock=e.target.closest(".unblock"); if(unblock){unblockUser(unblock.dataset.id);return}
  const chat=e.target.closest(".chat-user"); if(chat){selectChatUser(chat.dataset.chatUser);return}
});
$("publish-open").onclick=()=>demo?toast("اربط Supabase أولًا لتفعيل النشر الحقيقي."):open("publish-dialog");
$("media-pick").onclick=()=>$("media-file").click();
$("media-file").onchange=()=>{const f=$("media-file").files?.[0];if(!f)return;$("media-preview").classList.remove("hidden");$("media-preview").innerHTML=f.type.startsWith("video/")?`<video src="${URL.createObjectURL(f)}" controls></video>`:`<img src="${URL.createObjectURL(f)}" alt="">`};
$("publish-post").onclick=publish;
$("comment-form").onsubmit=sendComment;
$("header-profile").onclick=()=>showPage("profile");
$("search-open").onclick=()=>showPage("explore");
$("explore-search").onclick=()=>$("user-search").focus();
$("user-search").oninput=async()=>{const q=$("user-search").value.trim();if(!q||demo){$("search-results").innerHTML=demo?'<div class="result-card">اربط Supabase لتفعيل بحث المستخدمين الحقيقي.</div>':"";return}const {data}=await sb.from("profiles").select("id,display_name,username,avatar_url").or(`display_name.ilike.%${q}%,username.ilike.%${q}%`).limit(20);$("search-results").innerHTML=(data||[]).map(p=>`<button class="result-card row" data-user="${p.id}" style="width:100%;text-align:right"><img class="avatar" src="${avatar(p)}"><span><b>${esc(nameOf(p))}</b><small class="muted">@${esc(p.username||"")}</small></span></button>`).join("")};
$("settings-inline")?.addEventListener("click",()=>open("settings-dialog"));
$("profile-edit-inline")?.addEventListener("click",openEditProfile);
$("theme-toggle").onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";applyTheme()};
$("edit-profile").onclick=openEditProfile;
$("privacy-open").onclick=openPrivacy;
$("blocked-open").onclick=openBlocked;
$("requests-open").onclick=openRequests;
$("chat-open").onclick=()=>openChat();
$("logout").onclick=async()=>{if(sb)await sb.auth.signOut();};
$("notifications-read").onclick=async()=>{if(!demo)await sb.from("notifications").update({read:true}).eq("user_id",state.user.id);$("notif-dot").style.display="none";loadNotifications()};
$("chat-form").onsubmit=sendMessage;
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>close(b.dataset.close));
document.querySelectorAll("[data-auth-mode]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-auth-mode]").forEach(x=>x.classList.toggle("active",x===b));const reg=b.dataset.authMode==="register";$("auth-name").classList.toggle("hidden",!reg);$("auth-name").required=reg;$("auth-submit").textContent=reg?"إنشاء الحساب":"دخول";});
$("forgot-password").onclick=async()=>{
  if(demo)return authMessage("اربط Supabase أولًا.");
  const email=$("auth-email").value.trim(); if(!email)return authMessage("اكتب بريدك أولًا.");
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  authMessage(error?error.message:"أرسلنا رسالة استعادة كلمة المرور إلى بريدك.");
};
$("auth-form").onsubmit=async e=>{
  e.preventDefault(); if(demo)return authMessage("أضف بيانات Supabase في supabase-config.js.");
  const reg=!$("auth-name").classList.contains("hidden"),email=$("auth-email").value.trim(),password=$("auth-password").value,name=$("auth-name").value.trim();
  $("auth-submit").disabled=true;
  try{
    if(reg){
      const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}});
      if(error)throw error;
      if(data.session) await onSession(data.session); else authMessage("تم إنشاء الحساب. افتح رسالة التأكيد التي أرسلناها إلى بريدك.");
    }else{
      const {data,error}=await sb.auth.signInWithPassword({email,password}); if(error)throw error; await onSession(data.session);
    }
  }catch(err){authMessage(err.message||"تعذر إتمام العملية.")}finally{$("auth-submit").disabled=false}
};
$("profile-view").addEventListener("click",e=>{
  if(e.target.closest("#profile-edit-inline"))openEditProfile();
  if(e.target.closest("#settings-inline"))open("settings-dialog");
});
$("user-profile").addEventListener("click",async e=>{
  const f=e.target.closest("#profile-follow"),c=e.target.closest("#profile-chat"),m=e.target.closest("#profile-more"),uid=$("user-profile").dataset.uid;
  if(f)await followUser(uid); if(c)openChat(uid); if(m)showGeneric("إدارة العضو",`<div class="profile-actions"><button class="secondary-btn" id="block-now">حظر العضو</button></div>`); 
  $("generic-content").onclick=(ev)=>{if(ev.target?.id==="block-now")blockUser(uid)};
});
init();
})();
