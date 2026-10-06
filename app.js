const feed=document.querySelector("#feed");
const posts=[...document.querySelectorAll(".post")];

document.querySelector("#publishBtn").addEventListener("click",()=>document.querySelector("#publishDialog").showModal());
document.querySelector(".close").addEventListener("click",()=>document.querySelector("#publishDialog").close());

document.querySelectorAll(".like").forEach(btn=>{
  btn.addEventListener("click",()=>{
    btn.classList.toggle("liked");
    const b=btn.querySelector("b");
    b.textContent=btn.classList.contains("liked")?"♥":"♡";
  });
});
document.querySelectorAll(".save").forEach(btn=>{
  btn.addEventListener("click",()=>{
    btn.classList.toggle("liked");
    btn.querySelector("b").textContent=btn.classList.contains("liked")?"▣":"⌑";
  });
});
document.querySelectorAll(".tab").forEach(tab=>{
  tab.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    tab.classList.add("active");
  });
});

const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    const video=entry.target.querySelector("video");
    if(!video)return;
    if(entry.isIntersecting && entry.intersectionRatio>.65) video.play().catch(()=>{});
    else video.pause();
  });
},{threshold:[.2,.65,.9]});
posts.forEach(p=>observer.observe(p));

document.addEventListener("keydown",e=>{
  if(e.key==="ArrowDown") feed.scrollBy({top:innerHeight,behavior:"smooth"});
  if(e.key==="ArrowUp") feed.scrollBy({top:-innerHeight,behavior:"smooth"});
});
