(()=>{"use strict";
/* ============================================================
   PLUS FOR YOU — demo front end
   IMPORTANT: There is no real backend here. "Verification" of
   ads / referrals / withdrawals is SIMULATED locally so the UI
   is fully testable. Before shipping, replace:
     - watchAd()      -> real rewarded-ad SDK + server callback
     - claim()/withdraw() -> real server-verified endpoints
   No real money ever moves in this demo.
   ============================================================ */
const $=id=>document.getElementById(id);
const USERS_KEY="plusUsers", REG_KEY="plusRefRegistry", SESSION_KEY="plusSession";

function loadUsers(){try{return JSON.parse(localStorage.getItem(USERS_KEY)||"{}")}catch(e){return{}}}
function saveUsers(u){localStorage.setItem(USERS_KEY,JSON.stringify(u))}
function loadRegistry(){try{return JSON.parse(localStorage.getItem(REG_KEY)||"{}")}catch(e){return{}}}
function saveRegistry(r){localStorage.setItem(REG_KEY,JSON.stringify(r))}
function uid(){return Math.random().toString(16).slice(2,10)}
function todayKey(){return new Date().toISOString().slice(0,10)}
function fmtDate(ts){return new Date(ts).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}

let users=loadUsers(), registry=loadRegistry(), cur=null;

function genCode(email){
  let code;
  do{ code=(email.split("@")[0].slice(0,6)+"-"+Math.random().toString(36).slice(2,6)).toUpperCase().replace(/[^A-Z0-9-]/g,"X"); }
  while(registry[code]);
  return code;
}
function newUser(email){
  const code=genCode(email);
  const u={
    email, username: email.split("@")[0].replace(/[._]/g," ").replace(/\b\w/g,c=>c.toUpperCase()),
    coins:0, adsWatched:0, gamePoints:0, createdAt:Date.now(),
    refCode:code, appliedRef:null, referredUsers:[], ledger:[], withdrawals:[],
    dailyLastClaim:null
  };
  users[email]=u; registry[code]=email; saveUsers(users); saveRegistry(registry);
  return u;
}
function ledgerAdd(u,type,amount,status){
  u.ledger.unshift({id:uid(),type,amount,date:Date.now(),status:status||"verified",balance:u.coins});
  if(u.ledger.length>200)u.ledger.length=200;
}

/* ---------------- auth ---------------- */
function page(p){
 document.querySelectorAll(".page").forEach(x=>x.hidden=x.id!==p);
 document.querySelectorAll("nav [data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));
 const titles={home:"Welcome back",ads:"Watch Ads",games:"Games",referral:"Referral",profile:"Profile"};
 $("headerTitle").textContent=titles[p]||"Welcome back";
 if(p==="games")renderLeaderboard();
}
function enter(isSignup){
 const e=$("email").value.trim().toLowerCase(),p=$("password").value;
 if(!e||!p){$("msg").textContent="Enter email and password.";return}
 if(!/^\S+@\S+\.\S+$/.test(e)){$("msg").textContent="Enter a valid email address.";return}
 users=loadUsers(); registry=loadRegistry();
 if(isSignup && users[e]){$("msg").textContent="Account already exists — try logging in.";return}
 if(!isSignup && !users[e]){$("msg").textContent="No account found — try creating one.";return}
 cur = users[e] || newUser(e);
 localStorage.setItem(SESSION_KEY,e);
 const refQ=$("refQuery").value.trim().toUpperCase();
 if(isSignup && refQ && !cur.appliedRef){ applyReferralCode(refQ,true); }
 $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
 $("avatarBtn").textContent=cur.username[0].toUpperCase();
 $("username").textContent=cur.username; $("mail").textContent=cur.email;
 $("memberSince").textContent="Member since "+new Date(cur.createdAt).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
 render(); page("home");
}
function logout(){localStorage.removeItem(SESSION_KEY);location.reload()}

/* ---------------- referral logic ---------------- */
function applyReferralCode(code,silent){
 code=(code||"").trim().toUpperCase();
 const msgEl=$("refMsg");
 const setMsg=t=>{if(msgEl)msgEl.textContent=t; else if(!silent)$("msg").textContent=t};
 if(!code){setMsg("Enter a referral code.");return}
 if(cur.appliedRef){setMsg("You already applied a referral code.");return}
 if(code===cur.refCode){setMsg("You can't use your own code.");return}
 registry=loadRegistry();
 const ownerEmail=registry[code];
 if(!ownerEmail){setMsg("That referral code isn't valid.");return}
 cur.appliedRef={code,ownerEmail,status:"pending",appliedAt:Date.now()};
 users[cur.email]=cur; saveUsers(users);
 users=loadUsers();
 const owner=users[ownerEmail];
 if(owner){
   owner.referredUsers.push({email:cur.email,status:"pending",ads:0,joinedAt:Date.now()});
   users[ownerEmail]=owner; saveUsers(users);
 }
 setMsg("Referral code applied — pending verification.");
 render();
}
function progressReferredAds(){
 // when THIS user watches an ad, tick progress on whichever account referred them
 if(!cur.appliedRef || cur.appliedRef.status!=="pending")return;
 users=loadUsers();
 const owner=users[cur.appliedRef.ownerEmail];
 if(!owner)return;
 const entry=owner.referredUsers.find(r=>r.email===cur.email);
 if(!entry || entry.status!=="pending")return;
 entry.ads++;
 if(entry.ads>=10){entry.status="eligible"; cur.appliedRef.status="eligible";}
 users[owner.email]=owner; saveUsers(users);
 users[cur.email]=cur; saveUsers(users);
}
function claimReferralBonus(){
 users=loadUsers(); cur=users[cur.email];
 const eligible=cur.referredUsers.find(r=>r.status==="eligible");
 if(!eligible){return}
 eligible.status="claimed";
 cur.coins+=1200; ledgerAdd(cur,"Referral Bonus",1200);
 users[cur.email]=cur; saveUsers(users);
 render();
}

/* ---------------- ads ---------------- */
function renderAds(){
 const box=$("adButtons");if(!box)return;box.innerHTML="";
 const unlocked = 25 + (cur.referredUsers.filter(r=>r.status!=="pending").length>=2 ? 75 : 0);
 for(let i=1;i<=100;i++){
   const b=document.createElement("button");
   const isDone=i<=cur.adsWatched;
   const isLocked=i>unlocked;
   b.className="adbtn"+(isLocked?" locked":"");
   b.disabled=isLocked||isDone||i!==cur.adsWatched+1;
   b.textContent= isDone? `✅ Ad ${i} — Verified · +200 Coins`
                : isLocked? `🔒 Ad ${i} — Unlock after 2 verified referrals`
                : `📺 Watch Ad ${i} — +200 Coins after verified completion`;
   b.onclick=()=>startAd(i,b);
   box.appendChild(b);
 }
}
/* ---------------- real rewarded video ad (HilltopAds VAST) ----------------
   Plays an ACTUAL video ad (not a simulated timer). All "watch ad" actions
   on this page — the numbered list AND the dedicated card — funnel through
   this one function and share the same <video> element.
   NOTE: there is still no server-side postback here — completion is
   detected client-side via the video's "ended" event. It's real ad
   inventory, but the reward trigger is still fakeable (e.g. from
   devtools). CPAlead/Torox's Video Wall (once approved) is the path to a
   real server-verified rewarded ad.
   KNOWN RISK: some ad networks don't send CORS headers on their VAST
   endpoint, which makes fetch() fail silently in the browser even though
   the tag works fine when opened directly. If ads never load here, check
   the browser console for a CORS error — that's the most likely cause. */
const HILLTOP_VAST_URL="https://surefootedpause.com/dLmkFgz.dAGFNrvUZPGKUk/iepmn9luZZ/UBlhkcP_TtcXO/MgjHIEOIM/TNcitFNQz_QbyrMxjPQIyuMtQN";
const REAL_AD_COINS=200;

function playRealVastAd(){
 return new Promise(async (resolve,reject)=>{
   const container=$("realAdContainer"), video=$("realAdVideo");
   if(!container||!video){reject(new Error("no player on page"));return}
   try{
     const res=await fetch(HILLTOP_VAST_URL);
     const xmlText=await res.text();
     let xml=new DOMParser().parseFromString(xmlText,"text/xml");
     let mediaFile=xml.querySelector("MediaFile");
     if(!mediaFile){
       const wrapperUri=xml.querySelector("VASTAdTagURI");
       if(wrapperUri){
         const wRes=await fetch(wrapperUri.textContent.trim());
         const wText=await wRes.text();
         xml=new DOMParser().parseFromString(wText,"text/xml");
         mediaFile=xml.querySelector("MediaFile");
       }
     }
     if(!mediaFile){reject(new Error("no ad available"));return}
     video.src=mediaFile.textContent.trim();
     container.hidden=false;
     video.play().catch(()=>{}); // autoplay-block safety; controls still let user hit play
     video.onended=()=>{container.hidden=true;resolve()};
     video.onerror=()=>{container.hidden=true;reject(new Error("ad failed to play"))};
   }catch(e){reject(e)}
 });
}

async function startAd(i,btn){
 if(i!==cur.adsWatched+1)return;
 btn.disabled=true; btn.textContent=`⏳ Ad ${i}: loading ad…`;
 $("admsg").textContent="Fetching ad from provider…";
 try{
   await playRealVastAd();
   cur.adsWatched++; cur.coins+=200;
   ledgerAdd(cur,"Ad Reward",200);
   users[cur.email]=cur; saveUsers(users);
   progressReferredAds();
   $("admsg").textContent="Ad verified — 200 coins credited.";
   render();
 }catch(e){
   btn.disabled=false; btn.textContent=`📺 Watch Ad ${i} — +200 Coins after verified completion`;
   $("admsg").textContent="No ad available right now — try again shortly.";
 }
}

async function startRealVideoAd(btn){
 const msg=$("realAdMsg");
 btn.disabled=true; btn.textContent="Loading ad…";
 if(msg)msg.textContent="Fetching ad from provider…";
 try{
   btn.hidden=true;
   await playRealVastAd();
   btn.hidden=false;
   btn.disabled=false; btn.textContent="📺 Watch Real Video Ad — +"+REAL_AD_COINS+" Coins";
   cur.coins+=REAL_AD_COINS; cur.adsWatched++;
   ledgerAdd(cur,"Ad Reward (Real Video)",REAL_AD_COINS);
   users[cur.email]=cur; saveUsers(users);
   progressReferredAds();
   if(msg)msg.textContent="Ad verified — "+REAL_AD_COINS+" coins credited.";
   render();
 }catch(e){
   btn.hidden=false;
   btn.disabled=false; btn.textContent="📺 Watch Real Video Ad — +"+REAL_AD_COINS+" Coins";
   if(msg)msg.textContent="No ad available right now — try again shortly.";
 }
}

/* ---------------- games ---------------- */
function gp(n,label){cur.gamePoints+=n; users[cur.email]=cur; saveUsers(users); render(); alert((label?label+" — ":"")+"You earned "+n+" Game Points. They have no cash value.")}

const QUIZ_BANK=[
 {q:"What is the capital of France?",o:["Paris","Rome","Berlin","Madrid"],a:0},
 {q:"How many continents are there?",o:["5","6","7","8"],a:2},
 {q:"What is 12 × 8?",o:["96","88","108","104"],a:0},
 {q:"Which planet is known as the Red Planet?",o:["Venus","Mars","Jupiter","Saturn"],a:1},
 {q:"What is the largest ocean on Earth?",o:["Atlantic","Indian","Arctic","Pacific"],a:3},
 {q:"Who wrote 'Romeo and Juliet'?",o:["Dickens","Shakespeare","Tolstoy","Hemingway"],a:1},
 {q:"What gas do plants absorb from the air?",o:["Oxygen","Nitrogen","Carbon dioxide","Helium"],a:2},
 {q:"How many sides does a hexagon have?",o:["5","6","7","8"],a:1},
];
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function quiz(){
 const qs=shuffle(QUIZ_BANK).slice(0,5);
 let idx=0,score=0;
 function draw(){
   if(idx>=qs.length){
     $("game").innerHTML=`<div class="card"><h3>🧠 Quiz complete</h3><p>You scored <b>${score}/${qs.length}</b></p><button id="qAgain" class="primary wide">Play again</button></div>`;
     $("qAgain").onclick=quiz;
     if(score>0)gp(score*20,"Quiz");
     return;
   }
   const cur_q=qs[idx];
   $("game").innerHTML=`<div class="card"><h3>🧠 Quiz — ${idx+1}/${qs.length}</h3><p>${cur_q.q}</p><div id="qOpts"></div></div>`;
   const box=$("qOpts");
   cur_q.o.forEach((opt,i)=>{
     const b=document.createElement("button");b.className="quiz-opt";b.textContent=opt;
     b.onclick=()=>{
       document.querySelectorAll(".quiz-opt").forEach(x=>x.disabled=true);
       if(i===cur_q.a){b.classList.add("correct");score++}
       else{b.classList.add("wrong");box.children[cur_q.a].classList.add("correct")}
       setTimeout(()=>{idx++;draw()},700);
     };
     box.appendChild(b);
   });
 }
 draw();
}

function tap(){
 let taps=0,left=10,timer=null,started=false;
 $("game").innerHTML=`<div class="card"><h3>👆 Tap Challenge</h3><p class="muted">Tap as fast as you can in 10 seconds.</p><div class="tap-zone" id="tapZone">Tap to start</div><p>Taps: <b id="tapCount">0</b> · Time left: <b id="tapTime">10</b>s</p></div>`;
 const zone=$("tapZone");
 zone.onclick=()=>{
   if(!started){
     started=true;
     timer=setInterval(()=>{
       left--; $("tapTime").textContent=left;
       if(left<=0){
         clearInterval(timer); zone.onclick=null; zone.textContent="Time's up!";
         const pts=taps*2;
         if(pts>0)gp(pts,"Tap Challenge");
       }
     },1000);
   }
   if(left<=0)return;
   taps++; $("tapCount").textContent=taps; zone.textContent="Tap! ("+taps+")";
 };
}

function memory(){
 const emojis=["🍕","🚀","🐝","🎧","🌵","⚽"];
 const deck=shuffle(emojis.concat(emojis)).map((e,i)=>({id:i,e,flipped:false,matched:false}));
 let picked=[],moves=0,lock=false;
 $("game").innerHTML=`<div class="card"><h3>🎴 Memory Game</h3><p class="muted">Match all pairs. Moves: <b id="memMoves">0</b></p><div class="mem-grid" id="memGrid"></div></div>`;
 const grid=$("memGrid");
 function draw(){
   grid.innerHTML="";
   deck.forEach(c=>{
     const el=document.createElement("div");
     el.className="mem-card"+(c.flipped||c.matched?" flipped":"")+(c.matched?" matched":"");
     el.textContent=(c.flipped||c.matched)?c.e:"❔";
     el.onclick=()=>flip(c.id);
     grid.appendChild(el);
   });
 }
 function flip(id){
   if(lock)return;
   const c=deck.find(x=>x.id===id);
   if(!c||c.flipped||c.matched)return;
   c.flipped=true; picked.push(c); draw();
   if(picked.length===2){
     moves++; $("memMoves").textContent=moves; lock=true;
     setTimeout(()=>{
       const [a,b]=picked;
       if(a.e===b.e){a.matched=b.matched=true}
       else{a.flipped=b.flipped=false}
       picked=[]; lock=false; draw();
       if(deck.every(x=>x.matched)){
         const pts=Math.max(40,150-moves*8);
         gp(pts,"Memory Game");
       }
     },600);
   }
 }
 draw();
}

function daily(){
 const key="dailyDone:"+todayKey();
 const doneToday = cur.dailyLastClaim===todayKey();
 if(doneToday){
   $("game").innerHTML=`<div class="card"><h3>📅 Daily Challenge</h3><p>You already completed today's challenge. Come back tomorrow for a fresh one!</p></div>`;
   return;
 }
 const challenges=[
   "Name a planet in our solar system.",
   "What color do you get by mixing blue and yellow?",
   "How many days are in a leap year?",
   "What's the freezing point of water in Celsius?",
 ];
 const seed=new Date().getDate()%challenges.length;
 const answer=[["mercury","venus","earth","mars","jupiter","saturn","uranus","neptune"],["green"],["366"],["0"]][seed];
 $("game").innerHTML=`<div class="card"><h3>📅 Daily Challenge</h3><p>${challenges[seed]}</p><input id="dailyAns" placeholder="Your answer"><button id="dailySubmit" class="primary wide">Submit</button><p id="dailyMsg" class="message"></p></div>`;
 $("dailySubmit").onclick=()=>{
   const val=$("dailyAns").value.trim().toLowerCase();
   if(answer.includes(val)){
     cur.dailyLastClaim=todayKey();
     users[cur.email]=cur; saveUsers(users);
     $("dailyMsg").textContent="Correct!";
     gp(100,"Daily Challenge");
     daily();
   }else{
     $("dailyMsg").textContent="Not quite — try again.";
   }
 };
}

function ludo(){
 let cells="";
 for(let i=0;i<25;i++)cells+=`<div class="cell" style="background:${i===0?"#4c2a79":i===4?"#553d27":i===20?"#552735":i===24?"#54451f":"#251b32"}" id="lc${i}"></div>`;
 $("game").innerHTML=`<div class="card"><h3>🎲 Ludo vs Computer</h3><p class="muted">Race to square 25 • Game Points only</p><div class="ludo">${cells}</div><p id="ls">Your turn</p><button id="lr" class="primary">🎲 Roll Dice</button> <button id="ln" class="secondary">🔄 New Game</button></div>`;
 let p=0,c=0,done=false;
 function draw(){
   document.querySelectorAll(".cell").forEach(e=>e.innerHTML="");
   $("lc"+Math.min(p,24)).innerHTML+='<span class="token">Y</span>';
   $("lc"+Math.min(c,24)).innerHTML+='<span class="token">C</span>';
 }
 $("lr").onclick=()=>{
   if(done)return;
   let d=1+Math.floor(Math.random()*6);
   p=Math.min(24,p+d); $("ls").textContent="You rolled "+d; draw();
   if(p===24){done=true; gp(100,"Ludo"); $("ls").textContent="You won! +100 Game Points"; return}
   setTimeout(()=>{
     c=Math.min(24,c+1+Math.floor(Math.random()*6)); draw();
     if(c===24){done=true;$("ls").textContent="Computer won."}
   },500);
 };
 $("ln").onclick=ludo;
 draw();
}

/* ---------------- leaderboard ---------------- */
const LB_ALL=[["🏆 NovaPlayer",4820],["⭐ PixelKing",4260],["🪙 CoinMaster",3940],["🎯 QuizWhiz",3110],["🔥 StreakKing",2870]];
const LB_WEEK=[["⭐ PixelKing",640],["🏆 NovaPlayer",580],["🎯 QuizWhiz",510],["🪙 CoinMaster",410],["🔥 StreakKing",300]];
let lbMode="all";
function renderLeaderboard(){
 const list=(lbMode==="all"?LB_ALL:LB_WEEK).slice();
 list.push(["🎮 You",cur.gamePoints]);
 list.sort((a,b)=>b[1]-a[1]);
 const el=$("leaderboardList");if(!el)return;
 el.innerHTML="";
 list.forEach((row,i)=>{
   const li=document.createElement("li");
   if(row[0]==="🎮 You")li.classList.add("me");
   li.innerHTML=`<b>${i+1}</b><span>${row[0]}</span><strong>${row[1].toLocaleString()}</strong>`;
   el.appendChild(li);
 });
}

/* ---------------- render / update ---------------- */
function render(){
 users=loadUsers(); cur=users[cur.email];
 $("coins").textContent=cur.coins.toLocaleString();
 $("inr").textContent="≈ ₹"+(cur.coins/10).toFixed(2);
 $("gamePoints").textContent=cur.gamePoints.toLocaleString();
 $("ovPoints").textContent=cur.gamePoints.toLocaleString();
 $("adcount").textContent=cur.adsWatched;
 $("bar").style.width=Math.min(cur.adsWatched,100)+"%";

 const successfulRefs=cur.referredUsers.filter(r=>r.status==="claimed").length;
 const eligibleRefs=cur.referredUsers.filter(r=>r.status==="eligible"||r.status==="claimed").length;
 $("refs").textContent=successfulRefs;
 $("refGate").textContent=cur.adsWatched>=1?"Passed":"Locked";
 $("refBar").style.width=Math.min(eligibleRefs*50,100)+"%";
 $("refcode").textContent=cur.refCode;
 $("claim").disabled = !cur.referredUsers.some(r=>r.status==="eligible");

 // referral list
 const refListEl=$("refList");
 if(cur.referredUsers.length){
   refListEl.innerHTML="";
   cur.referredUsers.forEach(r=>{
     const div=document.createElement("div");div.className="ref-item";
     div.innerHTML=`<div><b>${r.email}</b><div class="muted">Joined ${fmtDate(r.joinedAt)} · ${r.ads}/10 ads</div></div><span class="ref-status ${r.status}">${r.status}</span>`;
     refListEl.appendChild(div);
   });
 } else refListEl.innerHTML=`<div class="empty">No referrals yet. Share your code to get started.</div>`;

 const ads25=cur.adsWatched>=25, refOk=eligibleRefs>=1, coins12k=cur.coins>=12000;
 const ready=ads25&&refOk&&coins12k;
 $("wstatus").textContent=ready?"Eligible":"Locked"; $("wstatus").className="status-pill "+(ready?"ok":"locked");
 $("wbadge").textContent=ready?"Eligible":"Locked"; $("wbadge").className="status-pill "+(ready?"ok":"locked");
 $("withdraw").disabled=!ready;
 $("wLockedBtn").hidden=ready; $("wLockedBtn").textContent="Withdrawal Locked";
 const checks=[["checkAds",ads25],["checkRefs",refOk],["checkCoins",coins12k],["checkVerify",true],["checkSafe",true],
               ["pcheckAds",ads25],["pcheckRefs",refOk]];
 checks.forEach(([id,ok])=>{const el=$(id);if(!el)return;el.firstElementChild.textContent=ok?"✅":"🔒";});

 $("eligBal").textContent=cur.coins.toLocaleString()+" ≈ ₹"+(cur.coins/10).toFixed(2);

 // ledger
 const ledgerEl=$("ledgerList");
 if(cur.ledger.length){
   ledgerEl.innerHTML="";
   cur.ledger.slice(0,25).forEach(l=>{
     const div=document.createElement("div");div.className="ledger-item";
     div.innerHTML=`<div><b>${l.type}</b><div class="muted">${fmtDate(l.date)} · Status: ${l.status} · Bal ${l.balance.toLocaleString()}</div></div><span class="ledger-amt">+${l.amount}</span>`;
     ledgerEl.appendChild(div);
   });
 } else ledgerEl.innerHTML=`<div class="empty">No verified transactions yet.</div>`;

 // withdrawal history
 const whEl=$("wHistory");
 if(cur.withdrawals.length){
   whEl.innerHTML="";
   cur.withdrawals.forEach(w=>{
     const div=document.createElement("div");div.className="wh-item";
     div.innerHTML=`<div><b>${w.amount.toLocaleString()} coins</b><div class="muted">${fmtDate(w.date)} · ${w.method}</div></div><span class="ref-status pending">${w.status}</span>`;
     whEl.appendChild(div);
   });
 } else whEl.innerHTML=`<div class="empty">No withdrawals yet.</div>`;

 renderAds();
 renderLeaderboard();
 users[cur.email]=cur; saveUsers(users);
}

/* ---------------- withdraw submit ---------------- */
function submitWithdraw(){
 const amount=+$("amount").value, method=$("method").value, upi=$("upi").value.trim();
 if(!amount||amount<12000){alert("Enter at least 12,000 coins.");return}
 if(amount>cur.coins){alert("Amount exceeds your available balance.");return}
 if(!method){alert("Select a payment method.");return}
 if(method==="UPI" && !/^[\w.\-]+@[\w]+$/.test(upi)){alert("Enter a valid UPI ID.");return}
 cur.coins-=amount;
 cur.withdrawals.unshift({id:uid(),amount,method,upi,date:Date.now(),status:"pending review"});
 ledgerAdd(cur,"Withdrawal Request",-amount,"pending");
 users[cur.email]=cur; saveUsers(users);
 alert("Withdrawal request submitted — pending backend verification (demo).");
 render();
}

/* ---------------- wire up ---------------- */
$("login").onclick=()=>enter(false);
$("signup").onclick=()=>enter(true);
$("logout").onclick=logout; $("logout2").onclick=logout;
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>page(b.dataset.page));
$("avatarBtn").onclick=()=>page("profile");
$("referNow").onclick=doShare; $("share").onclick=doShare;
$("copy").onclick=()=>{navigator.clipboard?.writeText(referralLink());alert("Referral link copied.")};
$("claim").onclick=claimReferralBonus;
$("applyRef").onclick=()=>applyReferralCode($("refInput").value);
$("withdraw").onclick=submitWithdraw;
$("lbAll").onclick=()=>{lbMode="all";$("lbAll").classList.add("active");$("lbWeek").classList.remove("active");renderLeaderboard()};
$("lbWeek").onclick=()=>{lbMode="week";$("lbWeek").classList.add("active");$("lbAll").classList.remove("active");renderLeaderboard()};
document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".subnav button").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");
 document.querySelectorAll(".profile-pane").forEach(x=>x.hidden=true);
 $("profile"+b.dataset.profile[0].toUpperCase()+b.dataset.profile.slice(1)).hidden=false;
});
$("ludo").onclick=ludo; $("quiz").onclick=quiz; $("tap").onclick=tap; $("memory").onclick=memory; $("daily").onclick=daily;
if($("realAdBtn"))$("realAdBtn").onclick=()=>startRealVideoAd($("realAdBtn"));

function referralLink(){return location.origin+location.pathname+"?ref="+encodeURIComponent(cur.refCode)}
function doShare(){const u=referralLink();try{navigator.share({title:"PLUS FOR YOU",text:"Join using my referral link",url:u})}catch(e){navigator.clipboard?.writeText(u);alert("Referral link copied.")}}

/* ---------------- boot ---------------- */
(function boot(){
 const params=new URLSearchParams(location.search);
 const ref=params.get("ref");
 if(ref)$("refQuery").value=ref;
 const session=localStorage.getItem(SESSION_KEY);
 if(session && users[session]){
   cur=users[session];
   $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
   $("avatarBtn").textContent=cur.username[0].toUpperCase();
   $("username").textContent=cur.username; $("mail").textContent=cur.email;
   $("memberSince").textContent="Member since "+new Date(cur.createdAt).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
   render(); page("home");
 }
})();
})();
