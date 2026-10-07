/* =========================================================
   KALIMAT | كلمات
   Firebase Edition
   Authentication + Firestore + Storage
   ========================================================= */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";


/* =========================================================
   FIREBASE INITIALIZATION
   ========================================================= */

const firebaseConfig = window.FIREBASE_CONFIG;

if (!firebaseConfig) {
  console.error("FIREBASE_CONFIG غير موجود في firebase-config.js");
  document.body.innerHTML = `
    <div style="
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:30px;
      font-family:Tajawal,sans-serif;
      text-align:center;
      direction:rtl;
      background:#050b16;
      color:white;
    ">
      <div>
        <h2>تعذر تشغيل كلمات</h2>
        <p>ملف Firebase configuration غير موجود.</p>
      </div>
    </div>
  `;
  throw new Error("FIREBASE_CONFIG missing");
}

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);


/* =========================================================
   DOM HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

const boot = $("boot");
const authScreen = $("auth");
const appScreen = $("app");
const authForm = $("auth-form");
const authName = $("auth-name");
const authEmail = $("auth-email");
const authPassword = $("auth-password");
const authSubmit = $("auth-submit");
const authNote = $("auth-note");

const feed = $("feed");
const toast = $("toast");

let currentAuthMode = "login";
let currentUser = null;
let currentProfile = null;
let currentFeedMode = "for-you";
let currentCommentPost = null;
let currentChatUser = null;
let currentMediaFile = null;

let unsubscribeNotifications = null;
let unsubscribeChat = null;


/* =========================================================
   STATE
   ========================================================= */

const state = {
  blocked: new Set(),
  following: new Set(),
  notifications: [],
  posts: [],
  profileCache: new Map()
};


/* =========================================================
   BASIC UI
   ========================================================= */

function show(element) {
  element?.classList.remove("hidden");
}

function hide(element) {
  element?.classList.add("hidden");
}

function toastMessage(message, duration = 3000) {
  if (!toast) return;

  toast.textContent = message;
  show(toast);

  clearTimeout(toastMessage.timer);

  toastMessage.timer = setTimeout(() => {
    hide(toast);
  }, duration);
}

function setAuthNote(message, type = "") {
  if (!authNote) return;

  authNote.textContent = message;
  authNote.className = "auth-note";

  if (type) {
    authNote.classList.add(type);
  }
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return "الآن";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch {
    return "الآن";
  }
}

function initials(name = "ك") {
  return escapeHTML(name.trim().slice(0, 1) || "ك");
}

function avatarHTML(profile, className = "") {
  const name = profile?.displayName || "مستخدم";
  const photo = profile?.photoURL;

  if (photo) {
    return `
      <img
        class="${className}"
        src="${escapeHTML(photo)}"
        alt="${escapeHTML(name)}"
        loading="lazy"
      >
    `;
  }

  return `
    <div class="${className} avatar-fallback">
      ${initials(name)}
    </div>
  `;
}


/* =========================================================
   DIALOG HELPERS
   ========================================================= */

function openDialog(id) {
  const dialog = $(id);

  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(id) {
  const dialog = $(id);

  if (!dialog) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}


/* =========================================================
   AUTH MODE
   ========================================================= */

function setAuthMode(mode) {
  currentAuthMode = mode;

  document
    .querySelectorAll("[data-auth-mode]")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.authMode === mode
      );
    });

  if (mode === "register") {
    show(authName);
    authName.required = true;
    authSubmit.textContent = "إنشاء الحساب";
  } else {
    hide(authName);
    authName.required = false;
    authSubmit.textContent = "دخول";
  }

  setAuthNote("");
}


/* =========================================================
   AUTHENTICATION
   ========================================================= */

async function handleAuth(event) {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();

  if (!email || !password) {
    setAuthNote("يرجى إدخال البريد وكلمة المرور.");
    return;
  }

  if (password.length < 8) {
    setAuthNote("كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل.");
    return;
  }

  authSubmit.disabled = true;

  try {
    if (currentAuthMode === "register") {

      if (!name) {
        setAuthNote("اكتب الاسم الظاهر أولًا.");
        authSubmit.disabled = false;
        return;
      }

      const result =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      await updateProfile(result.user, {
        displayName: name
      });

      await createUserProfile(result.user, {
        displayName: name
      });

      setAuthNote("تم إنشاء حسابك بنجاح.", "success");

    } else {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      setAuthNote("تم تسجيل الدخول.", "success");
    }

  } catch (error) {
    console.error(error);
    setAuthNote(firebaseAuthError(error));
  } finally {
    authSubmit.disabled = false;
  }
}

function firebaseAuthError(error) {
  const code = error?.code || "";

  const errors = {
    "auth/invalid-email":
      "البريد الإلكتروني غير صالح.",

    "auth/user-not-found":
      "لا يوجد حساب بهذا البريد الإلكتروني.",

    "auth/wrong-password":
      "كلمة المرور غير صحيحة.",

    "auth/invalid-credential":
      "البريد الإلكتروني أو كلمة المرور غير صحيحة.",

    "auth/email-already-in-use":
      "هذا البريد مستخدم مسبقًا.",

    "auth/weak-password":
      "كلمة المرور ضعيفة.",

    "auth/too-many-requests":
      "محاولات كثيرة. حاول لاحقًا.",

    "auth/network-request-failed":
      "تعذر الاتصال بالإنترنت.",

    "auth/operation-not-allowed":
      "تسجيل الدخول بالبريد غير مفعل في Firebase."
  };

  return errors[code] || "حدث خطأ. حاول مرة أخرى.";
}


/* =========================================================
   FIRESTORE PROFILE
   ========================================================= */

async function createUserProfile(user, extra = {}) {
  const profileRef = doc(db, "profiles", user.uid);

  const profile = {
    uid: user.uid,
    displayName:
      extra.displayName ||
      user.displayName ||
      "مستخدم كلمات",

    email: user.email || "",
    photoURL: user.photoURL || "",
    bio: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(profileRef, profile, {
    merge: true
  });

  currentProfile = {
    ...profile,
    uid: user.uid
  };

  state.profileCache.set(user.uid, currentProfile);
}

async function loadProfile(uid = currentUser?.uid) {
  if (!uid) return null;

  const cached = state.profileCache.get(uid);

  if (cached) {
    return cached;
  }

  const snap = await getDoc(
    doc(db, "profiles", uid)
  );

  if (!snap.exists()) {
    if (currentUser && uid === currentUser.uid) {
      await createUserProfile(currentUser);
      return currentProfile;
    }

    return null;
  }

  const profile = {
    uid,
    ...snap.data()
  };

  state.profileCache.set(uid, profile);

  if (uid === currentUser?.uid) {
    currentProfile = profile;
  }

  return profile;
}


/* =========================================================
   BLOCKED USERS
   ========================================================= */

async function loadBlocked() {
  state.blocked.clear();

  if (!currentUser) return;

  const q = query(
    collection(db, "blocks"),
    where("blockerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((item) => {
    const data = item.data();

    if (data.blockedId) {
      state.blocked.add(data.blockedId);
    }
  });
}

async function isBlockedByMe(uid) {
  return state.blocked.has(uid);
}

async function blockUser(uid) {
  if (!currentUser || !uid || uid === currentUser.uid) {
    return;
  }

  const id = `${currentUser.uid}_${uid}`;

  await setDoc(doc(db, "blocks", id), {
    blockerId: currentUser.uid,
    blockedId: uid,
    createdAt: serverTimestamp()
  });

  state.blocked.add(uid);

  await removeFollow(uid);

  toastMessage("تم حظر المستخدم.");
  await loadFeed();
}

async function unblockUser(uid) {
  if (!currentUser || !uid) return;

  const id = `${currentUser.uid}_${uid}`;

  await deleteDoc(
    doc(db, "blocks", id)
  );

  state.blocked.delete(uid);

  toastMessage("تم رفع الحظر.");
}


/* =========================================================
   FOLLOW SYSTEM
   ========================================================= */

async function loadFollowing() {
  state.following.clear();

  if (!currentUser) return;

  const q = query(
    collection(db, "follows"),
    where("followerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((item) => {
    const data = item.data();

    if (data.followingId) {
      state.following.add(data.followingId);
    }
  });
}

async function followUser(uid) {
  if (!currentUser || !uid || uid === currentUser.uid) {
    return;
  }

  if (state.blocked.has(uid)) {
    toastMessage("لا يمكنك متابعة مستخدم محظور.");
    return;
  }

  const id = `${currentUser.uid}_${uid}`;

  await setDoc(doc(db, "follows", id), {
    followerId: currentUser.uid,
    followingId: uid,
    createdAt: serverTimestamp()
  });

  state.following.add(uid);

  await createNotification(
    uid,
    "follow",
    `${currentProfile?.displayName || "مستخدم"} بدأ بمتابعتك.`
  );

  toastMessage("تمت المتابعة.");
  await renderProfile(uid);
}

async function removeFollow(uid) {
  if (!currentUser || !uid) return;

  const id = `${currentUser.uid}_${uid}`;

  try {
    await deleteDoc(
      doc(db, "follows", id)
    );
  } catch (error) {
    console.warn(error);
  }

  state.following.delete(uid);
}


/* =========================================================
   POSTS
   ========================================================= */

async function loadFeed() {
  if (!currentUser) return;

  feed.innerHTML = `
    <div class="card">
      <p>جارٍ تحميل الكلمات...</p>
    </div>
  `;

  try {
    let postsQuery;

    if (currentFeedMode === "following") {

      if (!state.following.size) {
        feed.innerHTML = `
          <div class="card empty-state">
            <h3>لا توجد متابعات بعد</h3>
            <p>تابع أشخاصًا لتظهر كلماتهم هنا.</p>
          </div>
        `;
        return;
      }

      const ids = [...state.following].slice(0, 10);

      const results = [];

      for (const uid of ids) {

        const q = query(
          collection(db, "posts"),
          where("authorId", "==", uid),
          limit(20)
        );

        const snap = await getDocs(q);

        snap.forEach((item) => {
          results.push({
            id: item.id,
            ...item.data()
          });
        });
      }

      results.sort(
        (a, b) =>
          timestampValue(b.createdAt) -
          timestampValue(a.createdAt)
      );

      state.posts = results.slice(0, 50);

    } else {

      postsQuery = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
        limit(50)
      );

      const snap = await getDocs(postsQuery);

      state.posts = snap.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));
    }

    await renderFeed();

  } catch (error) {
    console.error("loadFeed:", error);

    feed.innerHTML = `
      <div class="card">
        <h3>تعذر تحميل الكلمات</h3>
        <p>${escapeHTML(error.message || "حدث خطأ.")}</p>
      </div>
    `;
  }
}

function timestampValue(timestamp) {
  if (!timestamp) return 0;

  try {
    return timestamp.toMillis
      ? timestamp.toMillis()
      : new Date(timestamp).getTime();
  } catch {
    return 0;
  }
}

async function renderFeed() {
  if (!state.posts.length) {
    feed.innerHTML = `
      <div class="card empty-state">
        <h3>مرحبًا بك في كلمات 🌿</h3>
        <p>لا توجد كلمات منشورة بعد. كن أول من يشارك فكرة.</p>
      </div>
    `;
    return;
  }

  const html = [];

  for (const post of state.posts) {

    if (state.blocked.has(post.authorId)) {
      continue;
    }

    const profile =
      await loadProfile(post.authorId);

    if (!profile) continue;

    const likesQuery = query(
      collection(db, "likes"),
      where("postId", "==", post.id)
    );

    const likesSnap =
      await getDocs(likesQuery);

    let liked = false;

    likesSnap.forEach((like) => {
      if (like.data().userId === currentUser.uid) {
        liked = true;
      }
    });

    const commentsQuery = query(
      collection(db, "comments"),
      where("postId", "==", post.id)
    );

    const commentsSnap =
      await getDocs(commentsQuery);

    const media = post.mediaURL
      ? post.mediaType === "video"
        ? `
          <video
            class="post-media"
            controls
            preload="metadata"
            src="${escapeHTML(post.mediaURL)}"
          ></video>
        `
        : `
          <img
            class="post-media"
            loading="lazy"
            src="${escapeHTML(post.mediaURL)}"
            alt="صورة منشورة"
          >
        `
      : "";

    html.push(`
      <article class="post-card" data-post-id="${post.id}">

        <div class="post-head">

          <button
            class="user-button"
            data-user-profile="${post.authorId}"
          >
            ${avatarHTML(profile, "post-avatar")}

            <span>
              <b>${escapeHTML(profile.displayName || "مستخدم")}</b>
              <small>${formatDate(post.createdAt)}</small>
            </span>
          </button>

          <button
            class="post-menu"
            data-post-menu="${post.id}"
            aria-label="خيارات"
          >
            <i class="fa-solid fa-ellipsis"></i>
          </button>

        </div>

        <div class="post-content">
          ${escapeHTML(post.text || "").replace(/\n/g, "<br>")}
        </div>

        ${media}

        ${
          post.tag
            ? `<div class="post-tag">#${escapeHTML(post.tag)}</div>`
            : ""
        }

        <div class="post-actions">

          <button
            class="post-action ${liked ? "liked" : ""}"
            data-like="${post.id}"
          >
            <i class="fa-${
              liked ? "solid" : "regular"
            } fa-heart"></i>
            <span>${likesSnap.size}</span>
          </button>

          <button
            class="post-action"
            data-comments="${post.id}"
          >
            <i class="fa-regular fa-comment"></i>
            <span>${commentsSnap.size}</span>
          </button>

          <button
            class="post-action"
            data-share="${post.id}"
          >
            <i class="fa-solid fa-share-nodes"></i>
          </button>

        </div>

      </article>
    `);
  }

  feed.innerHTML =
    html.join("") ||
    `
      <div class="card">
        <p>لا توجد كلمات متاحة حاليًا.</p>
      </div>
    `;
}


/* =========================================================
   PUBLISH
   ========================================================= */

async function publishPost() {
  if (!currentUser) return;

  const text = $("post-text")?.value.trim();

  if (!text && !currentMediaFile) {
    toastMessage("اكتب شيئًا أو أضف صورة/فيديو.");
    return;
  }

  const button = $("publish-post");

  button.disabled = true;

  try {

    let mediaURL = "";
    let mediaType = "";

    if (currentMediaFile) {

      const extension =
        currentMediaFile.name.split(".").pop() || "file";

      const path =
        `posts/${currentUser.uid}/${Date.now()}.${extension}`;

      const storageRef = ref(
        storage,
        path
      );

      await uploadBytes(
        storageRef,
        currentMediaFile
      );

      mediaURL =
        await getDownloadURL(storageRef);

      mediaType =
        currentMediaFile.type.startsWith("video")
          ? "video"
          : "image";
    }

    await addDoc(
      collection(db, "posts"),
      {
        authorId: currentUser.uid,
        text: text || "",
        mediaURL,
        mediaType,
        tag: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    $("post-text").value = "";
    currentMediaFile = null;

    const preview = $("media-preview");

    if (preview) {
      preview.innerHTML = "";
      hide(preview);
    }

    closeDialog("publish-dialog");

    toastMessage("تم نشر كلمتك بنجاح ✨");

    await loadFeed();

  } catch (error) {
    console.error("publish:", error);
    toastMessage(
      "تعذر النشر: " +
      (error.message || "حدث خطأ.")
    );
  } finally {
    button.disabled = false;
  }
}


/* =========================================================
   MEDIA PICKER
   ========================================================= */

function handleMediaSelect(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  currentMediaFile = file;

  const preview = $("media-preview");

  if (!preview) return;

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video")) {

    preview.innerHTML = `
      <video
        controls
        style="max-width:100%;border-radius:16px"
        src="${url}"
      ></video>
    `;

  } else {

    preview.innerHTML = `
      <img
        src="${url}"
        alt="معاينة"
        style="max-width:100%;border-radius:16px"
      >
    `;
  }

  show(preview);
}


/* =========================================================
   LIKES
   ========================================================= */

async function toggleLike(postId) {
  if (!currentUser) return;

  const id =
    `${postId}_${currentUser.uid}`;

  const likeRef =
    doc(db, "likes", id);

  const existing =
    await getDoc(likeRef);

  if (existing.exists()) {

    await deleteDoc(likeRef);

  } else {

    const post =
      state.posts.find(
        (item) => item.id === postId
      );

    await setDoc(likeRef, {
      postId,
      userId: currentUser.uid,
      createdAt: serverTimestamp()
    });

    if (post && post.authorId !== currentUser.uid) {

      await createNotification(
        post.authorId,
        "like",
        `${currentProfile?.displayName || "مستخدم"} أعجب بكلمتك.`
      );
    }
  }

  await renderFeed();
}


/* =========================================================
   COMMENTS
   ========================================================= */

async function openComments(postId) {
  currentCommentPost = postId;

  $("comments-list").innerHTML = `
    <div class="card">
      جارٍ تحميل التعليقات...
    </div>
  `;

  openDialog("comments-dialog");

  await loadComments(postId);
}

async function loadComments(postId) {

  const q = query(
    collection(db, "comments"),
    where("postId", "==", postId),
    limit(100)
  );

  const snap = await getDocs(q);

  const comments = snap.docs
    .map((item) => ({
      id: item.id,
      ...item.data()
    }))
    .sort(
      (a, b) =>
        timestampValue(a.createdAt) -
        timestampValue(b.createdAt)
    );

  if (!comments.length) {
    $("comments-list").innerHTML = `
      <div class="card">
        <p>لا توجد تعليقات بعد.</p>
      </div>
    `;
    return;
  }

  const parts = [];

  for (const comment of comments) {

    const profile =
      await loadProfile(comment.userId);

    parts.push(`
      <div class="comment-item">

        ${avatarHTML(profile, "comment-avatar")}

        <div>
          <b>
            ${escapeHTML(
              profile?.displayName || "مستخدم"
            )}
          </b>

          <p>
            ${escapeHTML(comment.text || "")}
          </p>

          <small>
            ${formatDate(comment.createdAt)}
          </small>
        </div>

      </div>
    `);
  }

  $("comments-list").innerHTML =
    parts.join("");
}

async function submitComment(event) {
  event.preventDefault();

  if (!currentUser || !currentCommentPost) {
    return;
  }

  const input = $("comment-text");
  const text = input.value.trim();

  if (!text) return;

  try {

    await addDoc(
      collection(db, "comments"),
      {
        postId: currentCommentPost,
        userId: currentUser.uid,
        text,
        createdAt: serverTimestamp()
      }
    );

    const post =
      state.posts.find(
        (item) =>
          item.id === currentCommentPost
      );

    if (
      post &&
      post.authorId !== currentUser.uid
    ) {
      await createNotification(
        post.authorId,
        "comment",
        `${currentProfile?.displayName || "مستخدم"} علّق على كلمتك.`
      );
    }

    input.value = "";

    await loadComments(currentCommentPost);
    await renderFeed();

  } catch (error) {
    console.error(error);
    toastMessage("تعذر إضافة التعليق.");
  }
}


/* =========================================================
   SHARE
   ========================================================= */

async function sharePost(postId) {
  const url =
    `${location.origin}${location.pathname}#post-${postId}`;

  try {

    if (navigator.share) {

      await navigator.share({
        title: "كلمات",
        text: "شاهد هذه الكلمة على كلمات",
        url
      });

    } else {

      await navigator.clipboard.writeText(url);
      toastMessage("تم نسخ رابط المنشور.");

    }

  } catch (error) {
    console.log(error);
  }
}


/* =========================================================
   USER PROFILE
   ========================================================= */

async function openUserProfile(uid) {
  await renderProfile(uid);
  openDialog("profile-dialog");
}

async function renderProfile(uid) {

  const container = $("user-profile");

  if (!container) return;

  const profile =
    await loadProfile(uid);

  if (!profile) {
    container.innerHTML = `
      <div class="card">
        <p>المستخدم غير موجود.</p>
      </div>
    `;
    return;
  }

  const own =
    uid === currentUser?.uid;

  const following =
    state.following.has(uid);

  const blocked =
    state.blocked.has(uid);

  container.innerHTML = `
    <div class="profile-large">

      ${avatarHTML(profile, "profile-avatar")}

      <h2>
        ${escapeHTML(
          profile.displayName || "مستخدم كلمات"
        )}
      </h2>

      <p class="profile-bio">
        ${escapeHTML(
          profile.bio || "عضو في مجتمع كلمات."
        )}
      </p>

      ${
        own
          ? `
            <button
              class="primary wide"
              data-edit-own-profile
            >
              تعديل الملف الشخصي
            </button>
          `
          : `
            <div class="profile-buttons">

              ${
                blocked
                  ? `
                    <button
                      class="secondary-btn"
                      data-unblock="${uid}"
                    >
                      رفع الحظر
                    </button>
                  `
                  : `
                    <button
                      class="${
                        following
                          ? "secondary-btn"
                          : "primary"
                      }"
                      data-follow="${uid}"
                    >
                      ${
                        following
                          ? "إلغاء المتابعة"
                          : "متابعة"
                      }
                    </button>

                    <button
                      class="secondary-btn"
                      data-block="${uid}"
                    >
                      حظر
                    </button>
                  `
              }

            </div>
          `
      }

    </div>
  `;
}


/* =========================================================
   OWN PROFILE
   ========================================================= */

async function renderOwnProfile() {

  if (!currentUser) return;

  const profile =
    await loadProfile(currentUser.uid);

  const container =
    $("profile-view");

  if (!container) return;

  container.innerHTML = `
    <div class="profile-large">

      ${avatarHTML(profile, "profile-avatar")}

      <h2>
        ${escapeHTML(
          profile?.displayName || "مستخدم كلمات"
        )}
      </h2>

      <p class="profile-bio">
        ${escapeHTML(
          profile?.bio || "أهلًا بك في كلمات."
        )}
      </p>

      <button
        class="primary wide"
        id="profile-settings-inline"
      >
        إعدادات الهوية والمعلومات
      </button>

    </div>
  `;
}


/* =========================================================
   PROFILE EDITING
   ========================================================= */

function openProfileEditor() {

  const profile =
    currentProfile || {};

  $("generic-content").innerHTML = `

    <h2>إعدادات الهوية والمعلومات</h2>

    <form id="profile-edit-form">

      <input
        id="profile-name-input"
        class="field"
        maxlength="80"
        required
        value="${escapeHTML(
          profile.displayName || ""
        )}"
        placeholder="الاسم الظاهر"
      >

      <textarea
        id="profile-bio-input"
        class="field"
        maxlength="500"
        placeholder="نبذة عنك..."
      >${escapeHTML(
        profile.bio || ""
      )}</textarea>

      <label class="secondary-btn">
        <i class="fa-regular fa-image"></i>
        تغيير الصورة
        <input
          id="profile-photo-input"
          type="file"
          accept="image/*"
          hidden
        >
      </label>

      <button
        type="submit"
        class="primary wide"
      >
        حفظ التغييرات
      </button>

    </form>
  `;

  openDialog("generic-dialog");

  $("profile-edit-form")
    .addEventListener(
      "submit",
      saveProfile
    );
}

async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) return;

  const name =
    $("profile-name-input").value.trim();

  const bio =
    $("profile-bio-input").value.trim();

  const photoFile =
    $("profile-photo-input").files?.[0];

  if (!name) {
    toastMessage("الاسم مطلوب.");
    return;
  }

  try {

    let photoURL =
      currentProfile?.photoURL || "";

    if (photoFile) {

      const extension =
        photoFile.name.split(".").pop() || "jpg";

      const path =
        `avatars/${currentUser.uid}/profile.${extension}`;

      const storageRef =
        ref(storage, path);

      await uploadBytes(
        storageRef,
        photoFile
      );

      photoURL =
        await getDownloadURL(storageRef);
    }

    await updateProfile(
      currentUser,
      {
        displayName: name,
        photoURL
      }
    );

    await setDoc(
      doc(db, "profiles", currentUser.uid),
      {
        uid: currentUser.uid,
        displayName: name,
        email: currentUser.email || "",
        photoURL,
        bio,
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );

    currentProfile = {
      ...currentProfile,
      uid: currentUser.uid,
      displayName: name,
      photoURL,
      bio
    };

    state.profileCache.set(
      currentUser.uid,
      currentProfile
    );

    updateHeader();

    closeDialog("generic-dialog");

    await renderOwnProfile();

    toastMessage("تم حفظ الملف الشخصي.");

  } catch (error) {

    console.error(error);

    toastMessage(
      "تعذر حفظ الملف الشخصي."
    );
  }
}

function updateHeader() {

  if (!currentProfile) return;

  const avatar =
    $("header-avatar");

  if (avatar) {
    avatar.src =
      currentProfile.photoURL ||
      "./icon-192.png";
  }
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function createNotification(
  recipientId,
  type,
  text
) {
  if (!recipientId) return;

  await addDoc(
    collection(db, "notifications"),
    {
      recipientId,
      senderId: currentUser?.uid || "",
      type,
      text,
      read: false,
      createdAt: serverTimestamp()
    }
  );
}

function startNotificationsListener() {

  if (unsubscribeNotifications) {
    unsubscribeNotifications();
  }

  if (!currentUser) return;

  const q = query(
    collection(db, "notifications"),
    where(
      "recipientId",
      "==",
      currentUser.uid
    ),
    limit(50)
  );

  unsubscribeNotifications =
    onSnapshot(
      q,
      (snap) => {

        state.notifications =
          snap.docs
            .map((item) => ({
              id: item.id,
              ...item.data()
            }))
            .sort(
              (a, b) =>
                timestampValue(b.createdAt) -
                timestampValue(a.createdAt)
            );

        renderNotifications();
      },
      (error) => {
        console.error(
          "notifications:",
          error
        );
      }
    );
}

function renderNotifications() {

  const list =
    $("notifications-list");

  if (!list) return;

  if (!state.notifications.length) {

    list.innerHTML = `
      <div class="card">
        <p>لا توجد إشعارات حتى الآن.</p>
      </div>
    `;

    return;
  }

  const unread =
    state.notifications.filter(
      (item) => !item.read
    ).length;

  const dot =
    $("notif-dot");

  if (dot) {
    dot.classList.toggle(
      "active",
      unread > 0
    );
  }

  list.innerHTML =
    state.notifications
      .map(
        (item) => `
          <div
            class="card notification-item ${
              item.read ? "" : "unread"
            }"
          >
            <b>${escapeHTML(
              item.text || "إشعار جديد"
            )}</b>

            <small>
              ${formatDate(item.createdAt)}
            </small>
          </div>
        `
      )
      .join("");
}

async function markNotificationsRead() {

  const unread =
    state.notifications.filter(
      (item) => !item.read
    );

  for (const item of unread) {

    try {
      await updateDoc(
        doc(
          db,
          "notifications",
          item.id
        ),
        {
          read: true
        }
      );
    } catch (error) {
      console.warn(error);
    }
  }
}


/* =========================================================
   CHAT
   ========================================================= */

async function openChat() {

  openDialog("chat-dialog");

  await loadChatUsers();
}

async function loadChatUsers() {

  const container =
    $("chat-users");

  if (!container) return;

  container.innerHTML = `
    <div class="card">
      جارٍ تحميل المستخدمين...
    </div>
  `;

  try {

    const snap =
      await getDocs(
        query(
          collection(db, "profiles"),
          limit(50)
        )
      );

    const users =
      snap.docs
        .map((item) => ({
          uid: item.id,
          ...item.data()
        }))
        .filter(
          (user) =>
            user.uid !== currentUser.uid &&
            !state.blocked.has(user.uid)
        );

    if (!users.length) {
      container.innerHTML = `
        <div class="card">
          لا يوجد مستخدمون بعد.
        </div>
      `;
      return;
    }

    container.innerHTML =
      users
        .map(
          (user) => `
            <button
              class="chat-user"
              data-chat-user="${user.uid}"
            >
              ${avatarHTML(
                user,
                "chat-avatar"
              )}

              <span>
                ${escapeHTML(
                  user.displayName ||
                  "مستخدم"
                )}
              </span>
            </button>
          `
        )
        .join("");

  } catch (error) {

    console.error(error);

    container.innerHTML = `
      <div class="card">
        تعذر تحميل المستخدمين.
      </div>
    `;
  }
}

async function openChatWith(uid) {

  currentChatUser =
    await loadProfile(uid);

  if (!currentChatUser) return;

  $("chat-with").textContent =
    currentChatUser.displayName ||
    "مستخدم";

  if (unsubscribeChat) {
    unsubscribeChat();
  }

  const chatId =
    makeChatId(
      currentUser.uid,
      uid
    );

  const messagesRef =
    collection(
      db,
      "chats",
      chatId,
      "messages"
    );

  const q =
    query(
      messagesRef,
      orderBy("createdAt", "asc"),
      limit(100)
    );

  unsubscribeChat =
    onSnapshot(
      q,
      (snap) => {

        const messages =
          snap.docs.map(
            (item) => ({
              id: item.id,
              ...item.data()
            })
          );

        renderMessages(messages);
      },
      (error) => {
        console.error(
          "chat:",
          error
        );
      }
    );
}

function makeChatId(a, b) {
 
