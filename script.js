(()=>{"use strict";
/* ============================================================
   PLUS FOR YOU — Supabase-backed front end
   Auth lives in Supabase (see config.js for URL/anon key). All
   coin/points/referral/withdrawal writes go through Postgres
   RPC functions (award_ad_watch, award_game_points,
   claim_daily_challenge, apply_referral_code,
   claim_referral_bonus, request_withdrawal) — the browser never
   writes coins/ads_watched/game_points/daily_last_claim directly
   to the profiles table anymore (that policy was dropped
   server-side). After every RPC call we re-fetch the profile so
   the UI always reflects the authoritative server value.
   ============================================================ */
const $=id=>document.getElementById(id);
// Single source of truth for the Supabase URL/anon key is config.js (loaded
// before this file in index.html). Do not hardcode a second copy here —
// rotating the key would silently miss this file otherwise.
const sb = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

function uid(){return Math.random().toString(16).slice(2,10)}
function todayKey(){return new Date().toISOString().slice(0,10)}
function fmtDate(ts){return new Date(ts).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"})}

let cur=null; // current profile row (plus a few joined fields we attach: referredUsers, ledger, withdrawals)

/* ---------------- data loading ---------------- */
async function loadProfile(userId){
  const {data,error}=await sb.from("profiles").select("*").eq("id",userId).single();
  if(error||!data) return null;
  return data;
}

async function loadReferredUsers(userId){
  const {data,error}=await sb
    .from("referrals")
    .select("referred_id,status,ads_progress,joined_at,profiles!referrals_referred_id_fkey(email)")
    .eq("referrer_id",userId);
  if(error||!data) return [];
  return data.map(r=>({
    email:r.profiles?r.profiles.email:"(unknown)",
    status:r.status,
    ads:r.ads_progress,
    joinedAt:new Date(r.joined_at).getTime()
  }));
}

async function loadLedger(userId){
  const {data,error}=await sb.from("ledger").select("*").eq("user_id",userId).order("date",{ascending:false}).limit(25);
  if(error||!data) return [];
  return data.map(l=>({id:l.id,type:l.type,amount:l.amount,date:new Date(l.date).getTime(),status:l.status,balance:cur?cur.coins:0}));
}

async function loadWithdrawals(userId){
  const {data,error}=await sb.from("withdrawals").select("*").eq("user_id",userId).order("date",{ascending:false});
  if(error||!data) return [];
  return data.map(w=>({id:w.id,amount:w.amount,method:w.method,date:new Date(w.date).getTime(),status:w.status}));
}

async function refreshCurrent(){
  if(!cur) return;
  const profile=await loadProfile(cur.id);
  if(!profile) return;
  const [referredUsers,ledger,withdrawals]=await Promise.all([
    loadReferredUsers(cur.id), loadLedger(cur.id), loadWithdrawals(cur.id)
  ]);
  cur={...profile, referredUsers, ledger, withdrawals};
}

/* ledgerAdd removed — every RPC function now writes its own ledger
   row server-side, so the client never inserts into ledger. */

/* ---------------- Terms / Privacy / Reward Rules modal ---------------- */
const INFO_CONTENT={
 terms:{title:"Terms & Conditions",body:`To maintain a fair and secure platform for all users, the following conditions must be met before any withdrawal request can be approved:

• Users must complete the required ad-watching criteria as specified by the platform.
• Users must watch reward ads normally and completely. Repeatedly skipping, closing, or abusing ads is not allowed.
• Users must have genuine referral activity if referral requirements apply.
• Fake referrals, self-referrals, multiple accounts, bots, VPN abuse, automated activity, or any suspicious behavior are strictly prohibited.
• Users must comply with all platform rules and community guidelines.
• The platform reserves the right to review account activity before approving withdrawals.
• Any account found engaging in fraud, suspicious activity, or attempts to manipulate rewards may have its rewards, coins, or withdrawal privileges suspended or permanently removed.
• Withdrawal requests will only be processed after all eligibility requirements and verification checks have been successfully completed.
• The platform may modify reward rates, withdrawal limits, and eligibility requirements at any time.
• By using this platform, you agree to these Terms & Conditions and all future updates.

Withdrawal Eligibility
A withdrawal can only be requested when:
✅ Required ad-watching criteria are completed
✅ Referral requirements (if applicable) are completed
✅ No suspicious or fraudulent activity is detected
✅ Account verification requirements are met
✅ Minimum withdrawal amount is reached
✅ All platform rules have been followed

Failure to meet any of the above requirements may result in withdrawal rejection, delay, or account review.`},
 privacy:{title:"Privacy Policy",body:`Your privacy is important to us. We are committed to protecting your personal information and providing a safe experience for all users.

We collect only the information necessary to provide and improve our services, such as account details, reward activity, referrals, and transaction records.

Your personal data is stored securely and protected using industry-standard security measures.

We do not sell your personal information to third parties.

Your data is used only for account management, rewards processing, security monitoring, fraud prevention, and platform improvements.

We may collect anonymous usage statistics to help improve platform performance and user experience.

User information may be shared with trusted service providers only when necessary to operate the platform or comply with legal requirements.

We actively monitor for fraudulent activity, fake accounts, bots, and abuse to protect legitimate users and advertisers.

Users are responsible for keeping their account credentials secure and confidential.

While we take reasonable steps to protect user data, no online service can guarantee absolute security.

By using this platform, you agree to the collection and use of information as described in this Privacy Policy.

Your Data Is Safe
✅ Your personal information is protected and securely stored.
✅ We do not sell your personal data.
✅ We use security measures to prevent unauthorized access.
✅ We monitor the platform to protect users from fraud and abuse.
✅ Your information is used only to operate and improve the platform.

We are committed to maintaining a safe, secure, and trustworthy environment for all users. If you have any questions about your privacy or data security, please contact our support team.`},
 rules:{title:"Reward Rules",body:`Welcome to our Rewards Platform! Follow these simple steps to earn and use coins.

How to Earn Coins
🪙 Watch reward ads and earn coins.
🪙 Complete tasks and offers (if available).
🪙 Invite friends using your referral code and earn bonus rewards.
🪙 Participate in platform events and promotions.

How to Use Your Coins
🎮 Use your earned coins to play games on the platform.
🎮 Different games may require different coin amounts to enter.
🎮 Win games to earn more coins and increase your balance.
🎮 Your game winnings will be added to your account balance automatically.

Reward Rules
1. Coins can only be earned through legitimate platform activities.
2. Users must watch ads properly to receive rewards.
3. Fake activity, bots, auto-clickers, multiple accounts, or abuse of the reward system are strictly prohibited.
4. Rewards may be removed if suspicious activity is detected.
5. Game results are final and cannot be manually changed by users.
6. The platform reserves the right to adjust rewards, game rules, and earning rates when necessary.
7. Users must follow all Terms & Conditions to remain eligible for rewards and withdrawals.

Simple Guide
Step 1: Watch Ads 📺 → Earn Coins 🪙
Step 2: Use Coins 🪙 → Play Games 🎮
Step 3: Win Games 🎮 → Earn More Coins 🪙
Step 4: Complete Requirements ✅ → Request Withdrawal 💰

Important
Play fairly, watch ads normally, and follow platform rules. Honest users help keep the platform running and ensure rewards remain available for everyone. 🚀🪙`}
};
function openInfo(key){
 const c=INFO_CONTENT[key]; if(!c) return;
 $("infoTitle").textContent=c.title;
 $("infoBody").textContent=c.body;
 $("infoModal").classList.add("show");
}
function closeInfo(){ $("infoModal").classList.remove("show"); }
/* openInfo/closeInfo are called from inline onclick="" attributes in
   index.html, which can only resolve GLOBAL functions. This whole file is
   wrapped in a (()=>{...})() closure, so without this explicit exposure
   these two silently didn't exist on window — every tap threw "openInfo is
   not defined" (swallowed by the console-only error handler), which is why
   the Terms/Privacy/Reward Rules buttons looked like they did nothing. */
window.openInfo=openInfo;
window.closeInfo=closeInfo;

/* ---------------- RichAds debug panel (triple-tap header title) ---------------- */
function openRichDebug(){
 const body=$("richDebugBody");
 if(body) body.textContent=(window.richAdsLog&&window.richAdsLog.length) ? window.richAdsLog.join("\n") : "(no log entries yet)";
 $("richDebugModal").classList.add("show");
}
function closeRichDebug(){ $("richDebugModal").classList.remove("show"); }
window.closeRichDebug=closeRichDebug;
(function wireRichDebugTap(){
 let taps=0, tapTimer=null;
 const el=$("headerTitle");
 if(!el) return;
 el.addEventListener("click",()=>{
   taps++;
   clearTimeout(tapTimer);
   tapTimer=setTimeout(()=>{ taps=0; }, 1200);
   if(taps>=3){ taps=0; openRichDebug(); }
 });
})();

/* ---------------- auth ---------------- */
function page(p){
 document.querySelectorAll(".page").forEach(x=>x.hidden=x.id!==p);
 document.querySelectorAll("nav [data-page]").forEach(x=>x.classList.toggle("active",x.dataset.page===p));
 const titles={home:"Welcome back",ads:"Watch Ads",games:"Games",referral:"Referral",profile:"Profile"};
 $("headerTitle").textContent=titles[p]||"Welcome back";
 if(p==="games")renderLeaderboard();
 /* TADS static banner (widget 12267) only loads once its container is actually
    visible — the Ads page is hidden until the user taps the Ads tab, and some
    ad SDKs fail to render into a hidden (zero-size) container. */
 if(p==="ads"){ try{ ensureTadsBanner(); }catch(e){ console.warn("TADS banner init failed:",e); } }
 /* RichAds: fire an ad on every tab/section switch (home/ads/games/profile),
    in addition to the standalone timer below — both run together, so ads
    can show from navigation OR just from time passing, whichever comes
    first. fireNextRichAd() already no-ops quietly if the SDK isn't ready
    yet, so this is safe to call unconditionally. */
 try{ fireNextRichAd(); }catch(e){ console.warn("RichAds page-switch trigger failed:",e); }
 /* Recurring auto-refresh: once the player reaches home, reload the whole
    app every 3 minutes for as long as the session stays open (in case
    that's what lets ads keep picking up, same as a manual refresh does).
    Guarded so only one interval ever runs, even if home is revisited. */
 if(p==="home" && !window._pfyAutoReloadStarted){
   window._pfyAutoReloadStarted=true;
   setInterval(()=>{ location.reload(); }, 180000); // every 3 min
 }
}

/* ---------------- RichAds Mini App: continuous rotation ----------------
   Fires an ad every 45 seconds (so ~4 times per 3 minutes) for as long as
   the app stays open, regardless of which section the user is on — this
   runs independently of the page-switch trigger above, so ads can appear
   from either source. Waits for RichAds to report ready before the first
   fire.
   IMPORTANT: window.richAdsReady flipping true is a best-guess timer, not
   a real "the SDK can actually serve now" signal — on a slow/cold mobile
   connection it can flip early, before the SDK's internal setup is truly
   done, and the trigger call below rejects. Previously that single failed
   attempt was just logged and dropped, so nothing played again until the
   next scheduled tick (or, in practice, until the user manually refreshed
   and the SDK happened to init faster from cache). Now a failed attempt
   retries itself with backoff (2s, 4s, 8s, 16s) instead of waiting for the
   next tick, so a slow first load self-corrects. */
/* triggerInterstitialVideo removed from rotation: its RichAds dashboard
   traffic source (#408115) shows 0 clicks/revenue ever, and it fails every
   single call with the same internal SDK error — a real config problem on
   RichAds' side for that format, not something fixable from this code.
   Interstitial banner (#408114) and push-style (#408112) both already show
   real impressions + revenue on the dashboard, so only those two rotate
   until RichAds confirms video is fixed on their end. */
const RICHADS_ROTATION=["triggerInterstitialBanner","triggerNativeNotification"];
let richAdsRotationIdx=0;
function fireNextRichAd(){
 const ctrl=window.TelegramAdsController;
 if(!ctrl || !window.richAdsReady) return;
 const method=RICHADS_ROTATION[richAdsRotationIdx%RICHADS_ROTATION.length];
 richAdsRotationIdx++;
 richAdsFireWithRetry(method,0);
}
function richAdsFireWithRetry(method,attempt){
 try{
   const ctrl=window.TelegramAdsController;
   if(!ctrl || typeof ctrl[method]!=="function"){
     window._richAdsLog&&window._richAdsLog(method+": not available on controller");
     return;
   }
   ctrl[method]().then(()=>{
     window._richAdsLog&&window._richAdsLog(method+": played ok"+(attempt?(" (after retry "+attempt+")"):""));
   }).catch(e=>{
     window._richAdsLog&&window._richAdsLog(method+" failed (attempt "+attempt+"): "+(e&&e.message?e.message:e));
     if(attempt<4){
       setTimeout(()=>richAdsFireWithRetry(method,attempt+1), 2000*Math.pow(2,attempt));
     }
   });
 }catch(e){ window._richAdsLog&&window._richAdsLog(method+" threw: "+e.message); }
}
function startRichAdsRotation(){
 // Wait for the SDK to report ready (set in index.html after initialize())
 // before starting; keep checking every 500ms — no giving up. On a very
 // slow connection this may take a while, but it will start as soon as
 // the flag flips rather than requiring a refresh.
 const waitForReady=setInterval(()=>{
   if(window.richAdsReady){
     clearInterval(waitForReady);
     fireNextRichAd();                       // first ad shortly after ready, no refresh needed
     setInterval(fireNextRichAd,45000);       // then every 45s -> 4x per 3 minutes
   }
 },500);
}

async function enter(isSignup){
 const e=$("email").value.trim().toLowerCase(),p=$("password").value;
 if(!e||!p){$("msg").textContent="Enter email and password.";return}
 if(!/^\S+@\S+\.\S+$/.test(e)){$("msg").textContent="Enter a valid email address.";return}
 $("msg").textContent="Please wait…";

 let authRes;
 if(isSignup){
   authRes=await sb.auth.signUp({email:e,password:p});
 }else{
   authRes=await sb.auth.signInWithPassword({email:e,password:p});
 }
 if(authRes.error){
   $("msg").textContent=authRes.error.message;
   return;
 }
 const userId=authRes.data.user?authRes.data.user.id:authRes.data.session.user.id;

 // Give the DB trigger a moment to create the profile row on first signup.
 let profile=await loadProfile(userId);
 for(let i=0;i<5 && !profile;i++){ await new Promise(r=>setTimeout(r,400)); profile=await loadProfile(userId); }
 if(!profile){ $("msg").textContent="Account created, but profile setup is still finishing — please try logging in again in a few seconds."; return; }

 cur={...profile, referredUsers:[], ledger:[], withdrawals:[]};

 const refQ=$("refQuery").value.trim().toUpperCase();
 if(isSignup && refQ && !cur.applied_ref){ await applyReferralCode(refQ,true); }

 await refreshCurrent();
 $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
 $("avatarBtn").textContent=(cur.username||cur.email)[0].toUpperCase();
 $("username").textContent=cur.username||cur.email; $("mail").textContent=cur.email;
 $("memberSince").textContent="Member since "+new Date(cur.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
 render(); page("home");
}

async function logout(){ await sb.auth.signOut(); location.reload(); }

/* ---------------- referral logic ---------------- */
async function applyReferralCode(code,silent){
 code=(code||"").trim().toUpperCase();
 const msgEl=$("refMsg");
 const setMsg=t=>{if(msgEl)msgEl.textContent=t; else if(!silent)$("msg").textContent=t};
 if(!code){setMsg("Enter a referral code.");return}
 if(cur.applied_ref){setMsg("You already applied a referral code.");return}
 if(code===cur.ref_code){setMsg("You can't use your own code.");return}

 const {error}=await sb.rpc("apply_referral_code",{p_code:code});
 if(error){setMsg(error.message||"Could not apply referral code — try again.");return}

 setMsg("Referral code applied — pending verification.");
 await refreshCurrent(); render();
}

/* progressReferredAds removed — award_ad_watch() now ticks the
   referrer's ads_progress (and flips it to "eligible" at 10)
   server-side as part of the same RPC call. */

async function claimReferralBonus(){
 const {error}=await sb.rpc("claim_referral_bonus");
 if(error){ alert(error.message||"No eligible referral to claim."); return; }
 await refreshCurrent(); render();
}

/* REAL_AD_COINS: reward amount for AdsGram's rewarded ad, credited
   server-side via the adsgram-reward Edge Function postback. */
const REAL_AD_COINS=200;
const WITHDRAW_MIN=50000; // minimum coins per withdrawal request

/* ---------------- bridge for the 5 embedded mini-games (balloon/vortex/penalty/thimbles/skyflyer) ----------------
   Each game runs in a same-origin iframe and calls window.parent.PFY_GameBridge
   to read the real coin balance and push changes back through the sync_coins
   RPC (server-side capped + logged to the ledger — see SQL you were given). */
window.PFY_GameBridge = {
  getBalance(){ return cur ? Number(cur.coins)||0 : 0; },
  async syncBalance(newBalance, gameName){
    if(!cur) return 0;
    const {data,error} = await sb.rpc("sync_coins",{p_new_balance:Math.max(0,Math.round(newBalance)),p_game:gameName||"game"});
    if(error){ console.error("sync_coins failed:",error.message); return cur.coins; }
    cur.coins = data;
    if($("coins")) $("coins").textContent = cur.coins.toLocaleString();
    if($("inr")) $("inr").textContent = "≈ ₹"+(cur.coins/10).toFixed(2);
    return data;
  }
};

/* ---------------- games ---------------- */
async function gp(n,label){
 if(n<1) return; // award_game_points requires 1-1000
 const {error}=await sb.rpc("award_game_points",{p_points:Math.min(1000,Math.round(n))});
 if(error){ alert("Could not award points: "+error.message); return; }
 await refreshCurrent(); render();
 alert((label?label+" — ":"")+"You earned "+n+" Game Points. They have no cash value.")
}

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
 const doneToday = cur.daily_last_claim===todayKey();
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
 $("dailySubmit").onclick=async ()=>{
   const val=$("dailyAns").value.trim().toLowerCase();
   if(answer.includes(val)){
     const {error}=await sb.rpc("claim_daily_challenge",{p_points:100});
     if(error){ $("dailyMsg").textContent=error.message||"Could not claim — try again."; return; }
     await refreshCurrent();
     $("dailyMsg").textContent="Correct! +100 coins credited.";
     render();
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
 if(!cur)return;
 const list=(lbMode==="all"?LB_ALL:LB_WEEK).slice();
 list.push(["🎮 You",cur.game_points]);
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
 if(!cur)return;
 $("coins").textContent=cur.coins.toLocaleString();
 $("inr").textContent="≈ ₹"+(cur.coins/10).toFixed(2);
 $("gamePoints").textContent=cur.game_points.toLocaleString();
 $("ovPoints").textContent=cur.game_points.toLocaleString();
 if($("ovRefs"))$("ovRefs").textContent=cur.referredUsers.filter(r=>r.status==="claimed").length;
 if($("ovLevel"))$("ovLevel").textContent="Lv "+(1+Math.floor(cur.game_points/1000));

 const successfulRefs=cur.referredUsers.filter(r=>r.status==="claimed").length;
 const eligibleRefs=cur.referredUsers.filter(r=>r.status==="eligible"||r.status==="claimed").length;
 $("refs").textContent=successfulRefs;
 $("refGate").textContent=cur.ads_watched>=1?"Passed":"Locked";
 $("refBar").style.width=Math.min(eligibleRefs*50,100)+"%";
 const rc=cur.ref_code||"Not available"; $("refcode").textContent=rc; if($("refcode2"))$("refcode2").textContent=rc;
 $("claim").disabled = !cur.referredUsers.some(r=>r.status==="eligible");

 const refListEl=$("refList");
 if(cur.referredUsers.length){
   refListEl.innerHTML="";
   cur.referredUsers.forEach(r=>{
     const div=document.createElement("div");div.className="ref-item";
     div.innerHTML=`<div><b>${r.email}</b><div class="muted">Joined ${fmtDate(r.joinedAt)} · ${r.ads}/10 ads</div></div><span class="ref-status ${r.status}">${r.status}</span>`;
     refListEl.appendChild(div);
   });
 } else refListEl.innerHTML=`<div class="empty">No referrals yet. Share your code to get started.</div>`;

 const ads25=cur.ads_watched>=25, refOk=eligibleRefs>=1, coinsMin=cur.coins>=WITHDRAW_MIN;
 const ready=ads25&&refOk&&coinsMin;
 $("wstatus").textContent=ready?"Eligible":"Locked"; $("wstatus").className="status-pill "+(ready?"ok":"locked");
 $("wbadge").textContent=ready?"Eligible":"Locked"; $("wbadge").className="status-pill "+(ready?"ok":"locked");
 $("withdraw").disabled=!ready;
 $("wLockedBtn").hidden=ready; $("wLockedBtn").textContent="Withdrawal Locked";
 const checks=[["checkAds",ads25],["checkRefs",refOk],["checkCoins",coinsMin],["checkVerify",true],["checkSafe",true],
               ["pcheckAds",ads25],["pcheckRefs",refOk]];
 checks.forEach(([id,ok])=>{const el=$(id);if(!el)return;el.firstElementChild.textContent=ok?"✅":"🔒";});

 $("eligBal").textContent=cur.coins.toLocaleString()+" ≈ ₹"+(cur.coins/10).toFixed(2);

 const ledgerEl=$("ledgerList");
 const ledgerIcon=t=>t==="game_win"?"⭐":t==="referral_bonus"?"👥":"▶️";
 const ledgerCls=t=>t==="game_win"?"icon-orange":t==="referral_bonus"?"icon-blue":"icon-teal";
 if(cur.ledger.length){
   ledgerEl.innerHTML="";
   cur.ledger.forEach(l=>{
     const div=document.createElement("div");div.className="ledger-item";
     div.innerHTML=`<div class="li-left"><span class="li-icon ${ledgerCls(l.type)}">${ledgerIcon(l.type)}</span><div><b>${l.type}</b><div class="muted">${fmtDate(l.date)} · ${l.status}</div></div></div><span class="ledger-amt">${l.amount>=0?"+":""}${l.amount}</span>`;
     ledgerEl.appendChild(div);
   });
 } else ledgerEl.innerHTML=`<div class="empty">No verified transactions yet.</div>`;

 const whEl=$("wHistory");
 if(cur.withdrawals.length){
   whEl.innerHTML="";
   cur.withdrawals.forEach(w=>{
     const div=document.createElement("div");div.className="wh-item";
     div.innerHTML=`<div><b>${w.amount.toLocaleString()} coins</b><div class="muted">${fmtDate(w.date)} · ${w.method}</div></div><span class="ref-status pending">${w.status}</span>`;
     whEl.appendChild(div);
   });
 } else whEl.innerHTML=`<div class="empty">No withdrawals yet.</div>`;

 renderLeaderboard();
}

/* ---------------- withdrawal submitted popup ---------------- */
let wdLastFocus=null;
function showWithdrawPopup(amount,method){
 const pop=$("wdPopup");
 if(!pop){ alert("Withdrawal submitted. You will get it in 7 working days."); return; }
 $("wdAmt").textContent=amount.toLocaleString()+" coins (≈ ₹"+(amount/10).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})+")";
 $("wdMethod").textContent=method;
 wdLastFocus=document.activeElement;
 pop.classList.add("open");
 $("wdDone").focus();
}
function closeWithdrawPopup(){
 const pop=$("wdPopup"); if(pop)pop.classList.remove("open");
 if(wdLastFocus&&wdLastFocus.focus)wdLastFocus.focus();
}

/* ---------------- withdraw submit ---------------- */
async function submitWithdraw(){
 const amount=+$("amount").value, method=$("method").value, upi=$("upi").value.trim();
 if(!amount||amount<WITHDRAW_MIN){alert("Enter at least "+WITHDRAW_MIN.toLocaleString()+" coins.");return}
 if(amount>cur.coins){alert("Amount exceeds your available balance.");return}
 if(!method){alert("Select a payment method.");return}
 if(method==="UPI" && !/^[\w.\-]+@[\w]+$/.test(upi)){alert("Enter a valid UPI ID.");return}

 const {error}=await sb.rpc("request_withdrawal",{p_amount:amount,p_method:method,p_upi:upi});
 if(error){ alert(error.message||"Could not submit withdrawal — try again."); return; }
 await refreshCurrent();
 render();
 $("amount").value=""; $("upi").value="";
 showWithdrawPopup(amount,method);
}

/* ---------------- wire up ---------------- */
$("login").onclick=()=>enter(false);
$("signup").onclick=()=>enter(true);
$("logout").onclick=logout; $("logout2").onclick=logout;
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>page(b.dataset.page));
$("avatarBtn").onclick=()=>page("profile");
$("referNow").onclick=doShare; $("share").onclick=doShare;
function copyRefCode(){
 const code=cur&&cur.ref_code; if(!code){alert("Your referral code is not available yet.");return}
 try{ navigator.clipboard.writeText(code).then(()=>alert("Referral code copied: "+code)).catch(()=>prompt("Copy your referral code:",code)); }
 catch(e){ prompt("Copy your referral code:",code); }
}
$("copy").onclick=copyRefCode;
if($("copy2"))$("copy2").onclick=copyRefCode;
$("claim").onclick=claimReferralBonus;
$("applyRef").onclick=()=>applyReferralCode($("refInput").value);
$("withdraw").onclick=submitWithdraw;
if($("wdDone"))$("wdDone").onclick=closeWithdrawPopup;
if($("wdPopup"))$("wdPopup").addEventListener("click",e=>{ if(e.target===$("wdPopup"))closeWithdrawPopup(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&$("wdPopup")&&$("wdPopup").classList.contains("open"))closeWithdrawPopup(); });
$("lbAll").onclick=()=>{lbMode="all";$("lbAll").classList.add("active");$("lbWeek").classList.remove("active");renderLeaderboard()};
$("lbWeek").onclick=()=>{lbMode="week";$("lbWeek").classList.add("active");$("lbAll").classList.remove("active");renderLeaderboard()};
document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=()=>{
 document.querySelectorAll(".subnav button").forEach(x=>x.classList.remove("active"));
 b.classList.add("active");
 document.querySelectorAll(".profile-pane").forEach(x=>x.hidden=true);
 $("profile"+b.dataset.profile[0].toUpperCase()+b.dataset.profile.slice(1)).hidden=false;
});
if($("ludo"))$("ludo").onclick=ludo;
if($("quiz"))$("quiz").onclick=quiz;
if($("tap"))$("tap").onclick=tap;
if($("memory"))$("memory").onclick=memory;
if($("daily"))$("daily").onclick=daily;

/* ---------------- ONE "Watch Ad" button (TADS, Monetag, Adsbitvex, GigaPub) ----------------
   Tapping it picks a random ad network. If that network has no ad (or errors
   out quickly) the next network is tried, until one plays or all have failed.
   Safety rules:
   - Coins are only given if the ad really ran for at least MIN_AD_MS. An ad
     that "finishes" instantly (e.g. a network's own limit popup) earns nothing.
   - A network that fails quickly is put on hold for NET_HOLD_MS, so its error
     popup does not come back on every tap.
   - Coins are given by the server function record_ad_watch (adds coins, counts
     the ad, applies the 10-second gap and the daily cap). */
const AD_COINS=100;
function dbg(msg){
  try{
    const b=document.getElementById('debugBox');
    if(b){ b.style.display='block'; b.innerHTML+=msg+"<br>"; }
  }catch(e){}
}

const MIN_AD_MS=4000;          // default: an ad that finishes faster than this did not really play -> no coins
const FAST_FAIL_MS=8000;       // failing faster than this = "no ad available"
// false = ONE ad per tap. If a network has no ad, it is put on hold and the user taps again
//         (a different network is picked). This avoids two ads playing at the same time.
// true  = if a network fails, start the next network immediately (can overlap with an
//         error popup that a network is still showing).
const AUTO_FALLBACK=false;
const NET_HOLD_MS=60*60*1000;  // a network that failed fast is skipped for 1 hour
const TADS_WIDGET_ID="12224";
let tadsController=null, tadsPending=null;

function tadsOnShowReward(result){
  console.log("TADS reward:",result);
  if(tadsPending){ const p=tadsPending; tadsPending=null; p.reward(); }
}
function tadsOnAdsNotFound(){
  if(tadsPending){ const p=tadsPending; tadsPending=null; p.fail(); }
}
function ensureTads(){
  if(tadsController) return true;
  try{
    if(window.tads){
      tadsController=window.tads.init({widgetId:TADS_WIDGET_ID,type:"fullscreen",debug:false,onShowReward:tadsOnShowReward,onAdsNotFound:tadsOnAdsNotFound});
    }
  }catch(e){ console.warn("TADS SDK not available:",e); }
  return !!tadsController;
}

/* Static banner widget (12267) — plain click-through banner, no coins, no reward logic.
   Renders itself into <div id="tads-container-12267"> — but only after loadAd()+showAd() are called;
   init() alone does NOT render anything. */
const TADS_BANNER_WIDGET_ID="12267";
let tadsBannerController=null;
function ensureTadsBanner(){
  if(tadsBannerController) return true;
  try{
    if(window.tads){
      tadsBannerController=window.tads.init({
        widgetId:TADS_BANNER_WIDGET_ID,
        type:"static",
        debug:false,
        onAdsNotFound:()=>console.log("No banner ad available for widget "+TADS_BANNER_WIDGET_ID)
      });
      Promise.resolve(tadsBannerController.loadAd())
        .then(()=>tadsBannerController.showAd())
        .catch(e=>console.warn("TADS banner failed to load:",e));
    }
  }catch(e){ console.warn("TADS banner SDK not available:",e); }
  return !!tadsBannerController;
}

async function creditAdCoins(source){
  if(!cur) return;
  const {error}=await sb.rpc("record_ad_watch",{p_source:source});
  if(error){
    const err=new Error("credit_failed");
    err.stopMsg=error.message||"Could not save your reward — please try again.";
    throw err;
  }
  await refreshCurrent(); render();
}
const AD_DONE_MSG="Ad watched — +"+AD_COINS+" coins added!";

/* networks on hold after a quick failure (kept in memory + localStorage) */
const adHold={};
function isHeld(net){
  let t=adHold[net.name]||0;
  try{ t=Math.max(t,+localStorage.getItem("adHold_"+net.name)||0); }catch(e){}
  return Date.now()<t;
}
function holdNetwork(net){
  const t=Date.now()+NET_HOLD_MS; adHold[net.name]=t;
  try{ localStorage.setItem("adHold_"+net.name,String(t)); }catch(e){}
}
function releaseNetwork(net){
  delete adHold[net.name];
  try{ localStorage.removeItem("adHold_"+net.name); }catch(e){}
}

/* play() only shows the ad and resolves once it has been watched. Coins are given afterwards. */
const AD_NETWORKS=[
  { name:"TADS", source:"tads_ad",
    ready:()=>ensureTads(),
    play:()=>new Promise((resolve,reject)=>{
      let got=false;
      tadsPending={ reward:()=>{ got=true; resolve(); }, fail:()=>reject(new Error("tads_no_ad")) };
      Promise.resolve(tadsController.showAd())
        .then(()=>{ setTimeout(()=>{ if(!got&&tadsPending){ tadsPending=null; const e=new Error("tads_closed"); e.closed=true; reject(e); } },1500); })
        .catch(e=>{ tadsPending=null; reject(e); });
    }) },
  { name:"Monetag", source:"monetag_ad",
    ready:()=>typeof show_11834570==="function",
    play:async()=>{ await show_11834570(); } },
  { name:"Adsbitvex", source:"adsbitvex_ad", minMs:4000, /* lowered from 12s per request — was too long for users to wait */
    ready:()=>typeof window.showadsbitvex==="function",
    play:async()=>{ await window.showadsbitvex(); } },
  { name:"GigaPub", source:"gigapub_ad",
    ready:()=>typeof window.showGiga==="function",
    play:async()=>{ await window.showGiga(); } }
];

function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const k=Math.floor(Math.random()*(i+1)); [a[i],a[k]]=[a[k],a[i]]; } return a; }

async function tryNetwork(net){
  const t0=Date.now();
  try{ await net.play(); }
  catch(e){
    console.log(net.name+" ad failed:",e);
    const elapsed=Date.now()-t0;
    if(e&&e.closed) return {ok:false,stopMsg:"Ad closed early — no coins earned. Tap to try again."};
    if(elapsed<FAST_FAIL_MS){ holdNetwork(net); return {ok:false,noAd:true}; }         // no ad from this network
    return {ok:false,stopMsg:"Ad closed early — no coins earned. Tap to try again."};   // user closed a real ad
  }
  if((Date.now()-t0)<(net.minMs||MIN_AD_MS)){           // "finished" too fast = no real ad
    console.log(net.name+" finished too fast — no coins given");
    holdNetwork(net);
    return {ok:false,noAd:true};
  }
  try{ await creditAdCoins(net.source); }
  catch(e){ return {ok:false,stopMsg:(e&&e.stopMsg)||"Ad watched, but the coins could not be saved."}; }
  releaseNetwork(net);
  return {ok:true,msg:AD_DONE_MSG};
}

// Shows which network is being tried, so you can tell which one an ad or popup came from.
// Set to false when you no longer need it.
const SHOW_AD_NETWORK_NAME=true;
const adLabel=n=>SHOW_AD_NETWORK_NAME?" ("+n.name+")":"";

let adBusy=false;
let lastAdNetworkName=null;
async function watchAd(){
  if(adBusy) return; adBusy=true;
  const btn=$("watchAdBtn"), msg=$("adMsg");
  btn.disabled=true; btn.textContent="Loading ad…";
  try{
    const loaded=AD_NETWORKS.filter(n=>n.ready());
    if(!loaded.length){ if(msg)msg.textContent="Ad system not loaded yet — please try again in a moment."; return; }
    let pool=loaded.filter(n=>!isHeld(n));
    if(!pool.length){ if(msg)msg.textContent="No ad available right now — please try again in a while."; return; }
    /* Never show the same network twice in a row — unless it's the only
       one currently available, in which case there's no other option. */
    if(pool.length>1 && lastAdNetworkName){
      const withoutLast=pool.filter(n=>n.name!==lastAdNetworkName);
      if(withoutLast.length) pool=withoutLast;
    }
    const nets=shuffle(pool);
    for(const net of nets){
      if(msg)msg.textContent="Loading ad…"+adLabel(net);
      const r=await tryNetwork(net);
      if(r.ok){ lastAdNetworkName=net.name; if(msg)msg.textContent=r.msg+adLabel(net); return; }
      if(r.stopMsg){ lastAdNetworkName=net.name; if(msg)msg.textContent=r.stopMsg+adLabel(net); return; }
      if(!AUTO_FALLBACK){ if(msg)msg.textContent="No ad from this network right now — tap Watch Ad again"+adLabel(net); return; }
    }
    if(msg)msg.textContent="No ad available right now — try again shortly.";
  }finally{
    adBusy=false; btn.disabled=false; btn.textContent="🎬 Watch Ad — Earn Coins";
  }
}
if($("watchAdBtn"))$("watchAdBtn").onclick=watchAd;

function referralLink(){return location.origin+location.pathname+"?ref="+encodeURIComponent(cur.ref_code)}
function doShare(){const u=referralLink();try{navigator.share({title:"PLUS FOR YOU",text:"Join using my referral link",url:u})}catch(e){navigator.clipboard?.writeText(u);alert("Referral link copied.")}}

/* ---------------- boot ---------------- */
(async function boot(){
 const params=new URLSearchParams(location.search);
 const ref=params.get("ref");
 if(ref)$("refQuery").value=ref;

 const {data:{session},error:sessionErr}=await sb.auth.getSession();
 if(session){
   const {data:profile,error:profileErr}=await sb.from("profiles").select("*").eq("id",session.user.id).single();
   if(profileErr){ $("msg").textContent="Couldn't load your profile — please try logging in again."; }
   if(profile){
     cur={...profile, referredUsers:[], ledger:[], withdrawals:[]};
     await refreshCurrent();
     $("auth").hidden=true;$("app").hidden=false;$("nav").hidden=false;
     $("avatarBtn").textContent=(cur.username||cur.email)[0].toUpperCase();
     $("username").textContent=cur.username||cur.email; $("mail").textContent=cur.email;
     $("memberSince").textContent="Member since "+new Date(cur.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
     render(); page("home");
     try{ startRichAdsRotation(); }catch(e){ console.warn("RichAds rotation start failed:",e); }

     /* Monetag In-App Interstitial (zone 11834570) — passive full-screen ad,
        shows automatically, no coins, no user action needed.
        frequency: 2   -> max 2 ads per session
        capping: 0.33  -> session length = 20 minutes
        interval: 60   -> at least 60s between the 2 ads
        timeout: 20    -> waits 20s after app opens before the first ad
        everyPage: false -> session keeps counting across screen changes */
     try{
       if(typeof show_11834570==="function"){
         show_11834570({
           type:"inApp",
           inAppSettings:{ frequency:2, capping:0.33, interval:60, timeout:20, everyPage:false }
         });
       }
     }catch(e){ console.warn("Monetag in-app interstitial init failed:",e); }

     /* ---------------- capture Telegram ID (for AdsGram reward postback) ----
        If this page is opened inside Telegram (as a Mini App), Telegram
        injects window.Telegram.WebApp with the user's info. We save their
        numeric Telegram ID to profiles.telegram_id once, so AdsGram's
        server-side reward postback (which only knows the Telegram ID) can
        look up the matching Supabase user and credit coins. */
     try{
       if(window.Telegram && window.Telegram.WebApp){
         window.Telegram.WebApp.ready();
         const tgUser=window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user;
         if(tgUser && tgUser.id && String(tgUser.id)!==String(cur.telegram_id||"")){
           const {error:tgErr}=await sb.from("profiles").update({telegram_id:String(tgUser.id)}).eq("id",cur.id);
           if(tgErr) console.warn("Could not save telegram_id:",tgErr.message);
         }
         /* RichAds Bot Message ad — fires once per app open, sent to the
            user as a Telegram chat message (not shown inside the Mini App
            itself). Fire-and-forget: never blocks the UI, failures are
            just logged. Handled server-side by the show-bot-ad Supabase
            Edge Function (keeps the RichAds publisher ID + bot token off
            the client). */
         const tgIdForAd = (tgUser && tgUser.id) ? String(tgUser.id) : cur.telegram_id;
         if(tgIdForAd){
           fetch(window.SUPABASE_URL+"/functions/v1/show-bot-ad",{
             method:"POST",
             headers:{
               "Content-Type":"application/json",
               "Authorization":"Bearer "+window.SUPABASE_ANON_KEY,
               "apikey":window.SUPABASE_ANON_KEY
             },
             body:JSON.stringify({telegram_id:tgIdForAd,language_code:(tgUser&&tgUser.language_code)||"en"})
           }).catch(e=>console.warn("show-bot-ad call failed:",e));
         }
       }
     }catch(e){ console.warn("Telegram WebApp not available:",e); }
   }
 }
})();
})();
