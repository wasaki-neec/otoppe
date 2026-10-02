// このファイルは IndexedDB を使うための Dexie 設定ファイル。
// 服の画像や顔タイプなどをブラウザ内に保存し、ページを再読み込みしてもデータを残せるようにする役割を持つ。

// 1. データベースの初期化とテーブル作成
const db = new Dexie('MyClosetDatabase');

// バージョンとテーブル構成を定義
// userProfile: ユーザーの顔タイプを保存
// clothes: 服の画像とタイトル、カテゴリ、保存日時を保存
db.version(1).stores({
  userProfile: 'id, faceType', // 顔タイプ保存用
  clothes: '++id, title, category, imageBase64, createdAt' // 服データ保存用
});

// --- 顔タイプ保存関数 ---
async function saveFaceType(type) {
  await db.userProfile.put({ id: 'user_profile', faceType: type });
  console.log('顔タイプを保存しました:', type);
}

// --- 服データ（画像含む）保存関数 ---
async function addClothItem(title, category, imageFile) {
  // 画像ファイルをBase64文字列に変換して保存
  const reader = new FileReader();
  reader.readAsDataURL(imageFile);
  
  reader.onload = async () => {
    const base64Image = reader.result;
    
    await db.clothes.add({
      title: title,
      category: category,
      imageBase64: base64Image,
      createdAt: new Date().toISOString()
    });
    
    alert('クローゼットに服を保存しました！');
    loadClosetItems(); // 画面更新
  };
}

// --- クローゼットの服一覧を取得して画面に表示する関数 ---
async function loadClosetItems() {
  const allClothes = await db.clothes.toArray();
  const container = document.getElementById('closet-list');
  container.innerHTML = '';

  allClothes.forEach(item => {
    const card = document.createElement('div');
    card.className = 'cloth-card';
    card.innerHTML = `
      <img src="${item.imageBase64}" style="width:100px; height:100px; object-fit:cover;">
      <p><strong>${item.title}</strong> (${item.category})</p>
    `;
    container.appendChild(card);
  });
}