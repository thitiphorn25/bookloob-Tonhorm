// BookLoop — Supabase-powered marketplace. Configure SUPABASE_URL and SUPABASE_ANON_KEY below.
const SUPABASE_URL = "https://pdicixyjupwvuqucifwp.supabase.co".trim();
const SUPABASE_ANON_KEY = "sb_publishable_oQqmzZdNMlN-of44BSk9pg_e0oltk-I".trim();
const supabaseReady = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && SUPABASE_ANON_KEY.length > 30;
const db = supabaseReady ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (id) => document.getElementById(id);
const state = { user: null, listings: [], authMode: "login", activeDetail: null, editing: false, imageUrl: null };
const currency = (value, free=false) => free ? "ส่งต่อฟรี" : new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",maximumFractionDigits:0}).format(Number(value||0));
const esc = (s="") => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toast = (message) => { const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); };
const showModal = id => $(id).classList.remove("hidden");
const hideModal = id => $(id).classList.add("hidden");
const fallbackCover = "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=700&q=80";

function configGuard() {
  if (!db) {
    $("bookGrid").innerHTML = `<div class="loading-state"><b>ยินดีต้อนรับสู่ BookLoop ♡</b><p>เว็บไซต์พร้อมแล้ว ขั้นตอนถัดไปคือเชื่อมต่อ Supabase ตามคู่มือ SETUP.md<br>เมื่อเชื่อมต่อฐานข้อมูลแล้ว ประกาศหนังสือจะปรากฏที่นี่</p></div>`;
    $("resultCount").textContent = "รอเชื่อมต่อฐานข้อมูล";
    ["loginOpen","postOpen","heroPost","closingPost"].forEach(id=>$(id).addEventListener("click",()=>toast("กรุณาตั้งค่า Supabase ก่อนเปิดใช้งานระบบสมาชิก")));
    return false;
  }
  return true;
}


async function init() {
  wireUI();

  if (!configGuard()) return;

  const { data: { session } } = await db.auth.getSession();
  state.user = session?.user || null;

  await refreshListings();
  updateAccountButton();

  db.auth.onAuthStateChange((event, session) => {
    state.user = session?.user || null;
    updateAccountButton();

    if (event === "PASSWORD_RECOVERY") {
      showModal("resetPasswordModal");
    }
  });

  // BOOKLOOP REALTIME
  db.channel("bookloop-listings-live")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "listings"
      },
      async () => {
        await refreshListings();

        if (state.user) {
          await loadSellerStats();
        }
      }
    )
    .subscribe();
}

function wireUI(){
  $("loginOpen").addEventListener("click",()=>state.user?signOut():openAuth("login"));
  // เมนูบัญชีผู้ใช้
$("accountOpen")?.addEventListener("click", (e) => {
  e.stopPropagation();
  $("accountDropdown")?.classList.toggle("hidden");
});

$("openMyAccount")?.addEventListener("click", () => {
  $("accountDropdown")?.classList.add("hidden");
  openAccount();
});

$("backToShop")?.addEventListener("click", backToShop);

$("dropdownSignOut")?.addEventListener("click", () => {
  $("accountDropdown")?.classList.add("hidden");
  signOut();
});

// บันทึกข้อมูลบัญชี
$("saveAccountName")?.addEventListener("click", saveAccountName);

$("changeAccountPassword")?.addEventListener("click", () => {
  $("accountMessage").textContent =
    "ฟังก์ชันเปลี่ยนรหัสผ่านกำลังปรับปรุง";
});
 ["postOpen","heroPost","closingPost"].forEach(id=>{
  const el = $(id);
  if(el) el.addEventListener("click",openListing);
});
  $("searchToggle").addEventListener("click",()=>{ $("searchPanel").scrollIntoView({behavior:"smooth",block:"center"}); $("searchInput").focus(); });
  $("mobileMenu").addEventListener("click",()=>$("mainNav").classList.toggle("open"));
  $("refreshBooks").addEventListener("click",refreshListings);
  ["searchInput","categoryFilter","typeFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",renderListings));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>hideModal(b.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(bg=>bg.addEventListener("click",e=>{if(e.target===bg)hideModal(bg.id)}));
  document.querySelectorAll("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.authTab)));
  $("authForm").addEventListener("submit",submitAuth);
  $("resetPasswordForm").addEventListener("submit",submitNewPassword);
  $("forgotPasswordLink").addEventListener("click",sendPasswordReset);
  $("listingForm").addEventListener("submit",saveListing);
  $("listingType").addEventListener("change",togglePrice);
  $("lookupBook").addEventListener("click",lookupBook);
  $("bookGrid").addEventListener("click",e=>{const card=e.target.closest("[data-id]");if(card)openDetail(card.dataset.id)});
  $("detailContent").addEventListener("click",detailAction);
}

function backToShop(){
  const shopSections = [
    ".hero",
    ".intro-strip",
    ".books-section",
    "#sellerStatsSection",
    ".how-section",
    ".closing-banner",
    ".footer"
  ];

  shopSections.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.remove("hidden");
    });
  });

  $("accountSection")?.classList.add("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}
async function refreshListings(){
  if(!db)return;
  $("bookGrid").innerHTML='<div class="loading-state">กำลังเปิดชั้นหนังสือของเรา...</div>';
  const {data,error}=await db.from("listings").select("*").eq("status","available").order("created_at",{ascending:false});
  if(error){$("bookGrid").innerHTML='<div class="loading-state">โหลดรายการไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าฐานข้อมูล</div>';console.error(error);return}
  state.listings=data||[];renderListings();
}
function renderListings(){
  if(!db)return;
  const q=$("searchInput").value.trim().toLocaleLowerCase("th");
  const cat=$("categoryFilter").value,type=$("typeFilter").value;
  const rows=state.listings.filter(b=>(!cat||b.category===cat)&&(!type||b.listing_type===type)&&(!q||[b.title,b.author,b.isbn].join(" ").toLocaleLowerCase("th").includes(q)));
  $("resultCount").textContent=`พบหนังสือ ${rows.length} รายการ`;
  $("bookGrid").innerHTML=rows.map(b=>`<article class="book-card" data-id="${b.id}" tabindex="0"><div class="book-cover-wrap"><img class="book-cover" src="${esc(b.image_url||fallbackCover)}" alt="ปก ${esc(b.title)}" loading="lazy" onerror="this.src='${fallbackCover}'"><span class="book-tag">${esc(b.listing_type)}</span></div><div class="book-card-info"><h3>${esc(b.title)}</h3><p class="book-author">${esc(b.author)}</p><div class="book-meta"><span class="book-price">${currency(b.price,b.listing_type==="ส่งต่อฟรี")}</span><span class="book-condition">${esc(b.condition)}</span></div></div></article>`).join("");
  $("emptyState").classList.toggle("hidden",rows.length!==0);
}


function updateAccountButton(){
  $("loginOpen").textContent = state.user ? "ออกจากระบบ" : "เข้าสู่ระบบ";
  $("postOpen").textContent = "ลงประกาศ +";

  const accountMenu = $("accountMenuWrap");
  const accountOpen = $("accountOpen");

  accountMenu?.classList.toggle("hidden", !state.user);

  if (state.user) {
    const name =
      state.user.user_metadata?.display_name ||
      state.user.email?.split("@")[0] ||
      "สมาชิก BookLoop";

    const initial = [...name.trim()][0]?.toUpperCase() || "B";

    if ($("accountInitial")) $("accountInitial").textContent = initial;
    if ($("dropdownInitial")) $("dropdownInitial").textContent = initial;
    if ($("dropdownName")) $("dropdownName").textContent = name;
    if ($("dropdownEmail")) $("dropdownEmail").textContent = state.user.email || "";
  }

  $("accountDropdown")?.classList.add("hidden");
  $("accountSection")?.classList.add("hidden");

  const statsSection = $("sellerStatsSection");

  if (!state.user) {
    statsSection?.classList.add("hidden");
    return;
  }

  statsSection?.classList.remove("hidden");
  loadSellerStats();
}

function openAccount(){
  if(!state.user) {
    openAuth("login");
    return;
  }

  const name =
    state.user.user_metadata?.display_name || "";

  const shopSections = [
    ".hero",
    ".intro-strip",
    ".books-section",
    "#sellerStatsSection",
    ".how-section",
    ".closing-banner",
    ".footer"
  ];

  shopSections.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.classList.add("hidden");
    });
  });

  $("accountDisplayName").textContent =
    name || "สมาชิก BookLoop";

  $("accountEmail").textContent =
    state.user.email || "";

  $("accountName").value = name;
  $("accountMessage").textContent = "";

  $("accountSection").classList.remove("hidden");
  $("accountDropdown")?.classList.add("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function saveAccountName(){
  const name = $("accountName").value.trim();

  if(!name){
    $("accountMessage").textContent = "กรุณากรอกชื่อก่อนบันทึกนะ";
    return;
  }

  $("accountMessage").textContent = "กำลังบันทึก...";

  const {data, error} = await db.auth.updateUser({
    data: {display_name: name}
  });

  if(error){
    $("accountMessage").textContent = "บันทึกไม่สำเร็จ: " + error.message;
    return;
  }

  state.user = data.user;
  $("accountDisplayName").textContent = name;
  $("accountMessage").textContent = "บันทึกข้อมูลสำเร็จแล้ว ♡";
  toast("อัปเดตบัญชีแล้ว 💗");
}


let sellerStatsRequest = 0;

async function loadSellerStats(){
  if (!state.user || !db) return;
  const requestId = ++sellerStatsRequest;
const userId = state.user.id;

  const history = $("sellerHistoryList");
  history.innerHTML = "<p>กำลังโหลดข้อมูล...</p>";

  try {
    const { data, error } = await db
      .from("listings")
      .select("id,title,author,listing_type,price,status,created_at")
      .eq("seller_id", state.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (requestId !== sellerStatsRequest || state.user?.id !== userId) return;

    const books = data || [];

    const available = books.filter(b => b.status === "available");
    const completed = books.filter(b => b.status === "completed");

    const revenue = completed
      .filter(b => b.listing_type === "ขาย")
      .reduce((sum, b) => sum + Number(b.price || 0), 0);

    $("statTotal").textContent = books.length;
    $("statAvailable").textContent = available.length;
    $("statCompleted").textContent = completed.length;
    $("statRevenue").textContent = currency(revenue);

    if (completed.length === 0) {
      history.innerHTML = "<p>ยังไม่มีประวัติการขายหรือส่งต่อ 💗</p>";
      return;
    }

   history.innerHTML = completed.map(book => `
  <div class="seller-history-item">
    <div>
      <b>${esc(book.title)}</b>
      <br>
      <small>${esc(book.author)}</small>
      <br>
      <span class="history-status ${book.listing_type === "ขาย" ? "sold" : "shared"}">
        ${book.listing_type === "ขาย" ? "ขายแล้ว" : "ส่งต่อแล้ว"}
      </span>
    </div>
    <div>
      <b>${currency(book.price, book.listing_type === "ส่งต่อฟรี")}</b>
      <br>
      <small>${new Date(book.created_at).toLocaleDateString("th-TH")}</small>
    </div>
  </div>
`).join("");

  } catch (error) {
    console.error("Seller statistics error:", error);
    history.innerHTML = "<p>โหลดสถิติไม่สำเร็จ กรุณาลองใหม่</p>";
  }
}
function openAuth(mode){setAuthMode(mode);$("authMessage").textContent="";showModal("authModal")}
function setAuthMode(mode){
  state.authMode = mode;

document.querySelectorAll("[data-auth-tab]").forEach(b =>
  b.classList.toggle("active", b.dataset.authTab === mode)
);

$("nameField")?.classList.toggle("hidden", mode !== "signup");
$("confirmPasswordField")?.classList.toggle("hidden", mode !== "signup");
$("forgotPasswordLink")?.classList.toggle("hidden", mode !== "login");

  $("authTitle").innerHTML=mode==="login"
    ? 'Good to see <em>you.</em>'
    : 'Join the <em>loop.</em>';

  $("authSubmit").textContent=mode==="login"
    ? "เข้าสู่ระบบ"
    : "สมัครสมาชิก";

  $("authPasswordConfirm").required=mode==="signup";
  $("authPasswordConfirm").value="";
  $("authMessage").textContent="";
}
async function submitAuth(e){
  e.preventDefault();

  const email=$("authEmail").value.trim();
  const password=$("authPassword").value;
  const confirmPassword=$("authPasswordConfirm").value;
  const message=$("authMessage");

  if(password.length<6){
    message.textContent="รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    return;
  }

  if(state.authMode==="signup" && password!==confirmPassword){
    message.textContent="รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง";
    return;
  }

  message.textContent="กำลังดำเนินการ...";

  let result;

  try{
    if(state.authMode==="signup"){
      result=await db.auth.signUp({
        email,
        password,
        options:{
          data:{
            display_name:$("authName").value.trim()
          }
        }
      });
    }else{
      result=await db.auth.signInWithPassword({email,password});
    }
    

    if(result.error){
      message.textContent=result.error.message;
      return;
    }

    if(state.authMode==="signup"&&!result.data.session){
      message.textContent="สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี";
      return;
    }

    state.user=result.data.user;
    hideModal("authModal");
    updateAccountButton();
    toast("เข้าสู่ BookLoop แล้ว ♡");

  }catch(error){
    message.textContent="เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
    console.error(error);
  }
}

async function sendPasswordReset(){
  const email=$("authEmail").value.trim();
  const message=$("authMessage");

  if(!email){
    message.textContent="กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน";
    $("authEmail").focus();
    return;
  }

  message.textContent="กำลังส่งลิงก์รีเซ็ตรหัสผ่าน...";

  try{
    const {error}=await db.auth.resetPasswordForEmail(email,{
      redirectTo:window.location.origin+window.location.pathname
    });

    if(error){
      message.textContent="ส่งลิงก์ไม่สำเร็จ: "+error.message;
      return;
    }

    message.textContent="ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย 💗";

  }catch(error){
    message.textContent="เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
    console.error(error);
  }
}

async function submitNewPassword(e){
  e.preventDefault();

  const password = $("newPassword").value;
  const confirm = $("confirmNewPassword").value;
  const message = $("resetPasswordMessage");

  if(password.length < 6){
    message.textContent = "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    return;
  }

  if(password !== confirm){
    message.textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    return;
  }

  message.textContent = "กำลังบันทึกรหัสผ่าน...";

  try{
    const {error} = await db.auth.updateUser({password});

    if(error){
      message.textContent = "บันทึกไม่สำเร็จ: " + error.message;
      return;
    }

    $("resetPasswordForm").reset();
    hideModal("resetPasswordModal");
    hideModal("authModal");
    toast("เปลี่ยนรหัสผ่านสำเร็จแล้ว ♡");

  }catch(error){
    message.textContent = "เกิดข้อผิดพลาด กรุณาลองใหม่";
    console.error(error);
  }
} 

async function signOut(){await db.auth.signOut();state.user=null;updateAccountButton();toast("ออกจากระบบแล้ว");}
function openListing(){
  if(!db)return;
  if(!state.user){openAuth("login");toast("เข้าสู่ระบบก่อนลงประกาศนะ");return}
  state.editing=false;state.imageUrl=null;$("listingForm").reset();$("listingId").value="";$("currentImage").textContent="";$("listingTitle").innerHTML='ส่งต่อเรื่องราว <em>ของคุณ</em>';$("listingSubmit").textContent="เผยแพร่ประกาศ ↗";$("listingMessage").textContent="";togglePrice();showModal("listingModal");
}
function togglePrice(){const free=$("listingType").value==="ส่งต่อฟรี";$("priceField").classList.toggle("hidden",free);$("bookPrice").required=!free}
async function lookupBook(){
  const query=$("bookTitle").value.trim()||$("bookIsbn").value.trim();
  if(!query){toast("กรอกชื่อหนังสือหรือ ISBN ก่อนนะ");return}
  $("lookupBook").textContent="กำลังค้นหา...";
  try{
    const response=await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
    const data=await response.json();
    const item=data.items?.[0];
    if(!item){toast("ไม่พบข้อมูลหนังสือ ลองค้นด้วยชื่อหรือ ISBN อีกครั้ง");return}
    const info=item.volumeInfo||{};
    $("bookTitle").value=info.title||$("bookTitle").value;
    $("bookAuthor").value=(info.authors||[]).join(", ");
    $("bookIsbn").value=(info.industryIdentifiers||[]).find(x=>x.type==="ISBN_13")?.identifier||(info.industryIdentifiers||[])[0]?.identifier||"";
    if(info.imageLinks?.thumbnail){state.imageUrl=info.imageLinks.thumbnail.replace("http:","https:");$("currentImage").textContent="พบข้อมูลหนังสือจาก Google Books — หากต้องการใช้รูปปกนี้ ให้บันทึกภาพแล้วอัปโหลดเป็นรูปประกาศ"}
    toast("พบข้อมูลหนังสือแล้ว ตรวจสอบชื่อและผู้เขียนก่อนบันทึก");
  }catch(err){toast("ค้นหาหนังสือไม่สำเร็จ ลองอีกครั้ง")}
  finally{$("lookupBook").textContent="ค้นหาหนังสือจริง"}
}
async function saveListing(e){
  e.preventDefault();$("listingMessage").textContent="กำลังบันทึกประกาศ...";
  const title=$("bookTitle").value.trim(),author=$("bookAuthor").value.trim(),isbn=$("bookIsbn").value.trim();
  if(!title||!author){$("listingMessage").textContent="กรุณากรอกชื่อหนังสือและผู้เขียน";return}
  if(isbn&&!/^(?:97[89])?\d{9}[\dX]$/i.test(isbn.replace(/[-\s]/g,""))){$("listingMessage").textContent="รูปแบบ ISBN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";return}
  const file=$("bookImage").files[0];
  if(!file&&!state.editing){$("listingMessage").textContent="กรุณาอัปโหลดรูปหนังสือจริง";return}
  if(file&&(file.size>5*1024*1024||!file.type.startsWith("image/"))){$("listingMessage").textContent="ไฟล์ต้องเป็นรูปภาพและมีขนาดไม่เกิน 5 MB";return}
  let imageUrl=state.imageUrl;
  if(file){
    const ext=file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await db.storage.from("book-covers").upload(path,file,{upsert:false,contentType:file.type});
    if(uploadError){$("listingMessage").textContent="อัปโหลดรูปไม่สำเร็จ: "+uploadError.message;return}
    imageUrl=db.storage.from("book-covers").getPublicUrl(path).data.publicUrl;
  }
  if(!imageUrl&&state.editing)imageUrl=state.activeDetail?.image_url;
  const free=$("listingType").value==="ส่งต่อฟรี";
  const payload={title,author,isbn:isbn||null,category:$("bookCategory").value,condition:$("bookCondition").value,listing_type:$("listingType").value,price:free?0:Number($("bookPrice").value),description:$("bookDescription").value.trim(),image_url:imageUrl,seller_name:$("sellerName").value.trim(),seller_phone:$("sellerPhone").value.trim()||null,seller_line:$("sellerLine").value.trim()||null,seller_email:state.user.email,status:"available"};
  let result;
  if(state.editing) result=await db.from("listings").update(payload).eq("id",$("listingId").value).eq("seller_id",state.user.id);
  else result=await db.from("listings").insert({...payload,seller_id:state.user.id});
  if(result.error){$("listingMessage").textContent="บันทึกไม่สำเร็จ: "+result.error.message;return}
  hideModal("listingModal");toast(state.editing?"อัปเดตประกาศแล้ว":"ลงประกาศสำเร็จแล้ว ♡");await refreshListings();
}
async function openDetail(id){
  let b = state.listings.find(x => x.id === id);

  // ถ้าไม่พบในรายการทั่วไป ให้ค้นจากหนังสือของบัญชีตัวเอง
  if (!b && state.user && db) {
    const { data, error } = await db
      .from("listings")
      .select("*")
      .eq("id", id)
      .eq("seller_id", state.user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    b = data;
  }

  if (!b) return;
  state.activeDetail = b;
  const mine=state.user?.id===b.seller_id;
  $("detailContent").innerHTML=`<div class="detail-layout"><img class="detail-cover" src="${esc(b.image_url||fallbackCover)}" alt="ปก ${esc(b.title)}"><div class="detail-info"><p class="eyebrow">${esc(b.category)} · ${esc(b.listing_type)}</p><h2>${esc(b.title)}</h2><p class="author">โดย ${esc(b.author)}</p><div class="detail-price">${currency(b.price,b.listing_type==="ส่งต่อฟรี")}</div><div class="detail-facts">สภาพหนังสือ: ${esc(b.condition)}<br>ISBN: ${esc(b.isbn||"ไม่ระบุ")}<br>ลงประกาศ: ${new Date(b.created_at).toLocaleDateString("th-TH")}</div><p class="detail-description">${esc(b.description||"ไม่มีรายละเอียดเพิ่มเติม")}</p><div class="contact-box"><b>ติดต่อผู้ประกาศ: ${esc(b.seller_name)}</b><br>${b.seller_phone?`โทร: <a href="tel:${esc(b.seller_phone)}">${esc(b.seller_phone)}</a><br>`:""}${b.seller_line?`LINE ID: ${esc(b.seller_line)}<br>`:""}อีเมล: <a href="mailto:${esc(b.seller_email)}">${esc(b.seller_email)}</a></div>${mine?`<div class="detail-actions"><button class="outline-button" data-action="edit">แก้ไขประกาศ</button><button class="danger-button" data-action="sold">ทำเครื่องหมายว่าขาย/ส่งต่อแล้ว</button><button class="danger-button" data-action="delete">ลบประกาศ</button></div>`:""}</div></div>`;
  showModal("detailModal");
}
async function detailAction(e){
  const action=e.target.dataset.action,b=state.activeDetail;if(!action||!b)return;
  if(action==="edit"){
    hideModal("detailModal");state.editing=true;$("listingForm").reset();$("listingId").value=b.id;state.imageUrl=b.image_url;
    $("listingTitle").innerHTML='แก้ไขประกาศ <em>ของคุณ</em>';$("listingSubmit").textContent="บันทึกการเปลี่ยนแปลง";
    $("bookTitle").value=b.title;$("bookAuthor").value=b.author;$("bookIsbn").value=b.isbn||"";$("bookCategory").value=b.category;$("bookCondition").value=b.condition;$("listingType").value=b.listing_type;$("bookPrice").value=b.price;$("bookDescription").value=b.description||"";$("sellerName").value=b.seller_name;$("sellerPhone").value=b.seller_phone||"";$("sellerLine").value=b.seller_line||"";$("currentImage").textContent="มีรูปเดิมแล้ว — เลือกรูปใหม่ได้หากต้องการเปลี่ยน";togglePrice();showModal("listingModal");
  } else if(action==="sold"){
    if(!confirm("ยืนยันเปลี่ยนสถานะหนังสือเป็นขาย/ส่งต่อแล้ว?"))return;
    const {error}=await db.from("listings").update({status:"completed"}).eq("id",b.id).eq("seller_id",state.user.id);
    if (error) {
  toast(error.message);
  return;
}

hideModal("detailModal");
toast("อัปเดตสถานะแล้ว 💗");

await refreshListings();
await loadSellerStats();
  } else if(action==="delete"){
    if(!confirm("ต้องการลบประกาศนี้ใช่ไหม?"))return;
    const {error}=await db.from("listings").delete().eq("id",b.id).eq("seller_id",state.user.id);
    if(error){toast(error.message);return}hideModal("detailModal");toast("ลบประกาศแล้ว");refreshListings();
  }
}
// =====================================
// BOOKLOOP AI ASSISTANT
// =====================================

async function generateBookDescription() {
  const button = $("aiGenerate");
  const message = $("aiMessage");
  const resultBox = $("aiResult");

  const title = $("bookTitle").value.trim();
  const author = $("bookAuthor").value.trim();

  if (!title || !author) {
    message.textContent = "กรุณากรอกชื่อหนังสือและผู้เขียนก่อนนะ";
    return;
  }

  button.disabled = true;
  button.textContent = "✦ AI กำลังคิด...";
  message.textContent = "กำลังให้ AI ช่วยเขียนคำบรรยาย...";
  resultBox.classList.add("hidden");

  try {
    const response = await fetch("https://bookloob-tada.onrender.com/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        author,
        isbn: $("bookIsbn").value.trim(),
        category: $("bookCategory").value,
        condition: $("bookCondition").value,
        
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "AI ไม่สามารถประมวลผลได้");
    }

    $("aiCategory").textContent = "หมวดหมู่ที่แนะนำ: " + data.category;
    $("aiDescription").value = data.description;

    resultBox.classList.remove("hidden");
    message.textContent = "✦ AI เขียนคำบรรยายเสร็จแล้ว ตรวจสอบก่อนนำไปใช้นะ";

  } catch (error) {
    message.textContent = error.message || "เชื่อมต่อ AI ไม่สำเร็จ";
  } finally {
    button.disabled = false;
    button.textContent = "✦ ให้ AI ช่วยเขียนคำบรรยาย";
  }
}

function applyAIDescription() {
  const description = $("aiDescription").value;
  if (!description) return;

  $("bookDescription").value = description;

  const categoryText = $("aiCategory").textContent
    .replace("หมวดหมู่ที่แนะนำ: ", "").trim();

  const categorySelect = $("bookCategory");
  const option = [...categorySelect.options].find(
    item => item.text.trim() === categoryText ||
            item.value.trim() === categoryText
  );

  if (option) categorySelect.value = option.value;

  $("aiMessage").textContent = "นำคำบรรยายไปใส่ในแบบฟอร์มแล้ว 💗";
}

$("aiGenerate")?.addEventListener("click", generateBookDescription);
$("aiApply")?.addEventListener("click", applyAIDescription);
init();
$("togglePassword")?.addEventListener("click", () => {
  const password = $("authPassword");
  const isHidden = password.type === "password";

  password.type = isHidden ? "text" : "password";

  $("togglePassword").textContent = isHidden ? "🙈" : "👁";
});