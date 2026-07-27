/*
	sisaku1.js
	- プロトタイプの振る舞いを実装する軽量スクリプト
	- 以下の機能をサポートします:
		・UI初期化とイベント登録
		・位置情報からの天気取得（Open-Meteo）
		・気分（ムード）選択の保存
		・カメラ起動 / 撮影（簡易顔タイプ判定：縦横比で判断）
		・クローゼット画像のローカル保存（localStorage）と表示
		・登録画像からの簡易コーデ提案
*/

// DOM が準備できたら初期化処理を実行
document.addEventListener('DOMContentLoaded',()=>{
	initUI();      // ボタンや入力にイベントを割り当て
	loadCloset();   // 保存済みのクローゼット画像を読み込み表示
	updateWeather();// 現在の気候情報を取得して表示
});


// --- UI 初期化: ボタンや入力フォームにイベントハンドラを登録 ---
function initUI(){
	document.getElementById('refreshWeather').addEventListener('click', updateWeather);
	// ナビボタンは対応セクションを表示するだけ（簡易なルーティング）
	document.getElementById('toFace').addEventListener('click',()=>showSection('faceSection'));
	document.getElementById('toCloset').addEventListener('click',()=>showSection('closetSection'));
	document.getElementById('toPropose').addEventListener('click',()=>showSection('proposeSection'));

	// ムードボタン: 選択状態を切り替え、localStorage に保存
	Array.from(document.querySelectorAll('#moodButtons button')).forEach(btn=>{
		btn.addEventListener('click',()=>{selectMood(btn)});
	});

	// カメラ操作ボタン
	document.getElementById('startCamera').addEventListener('click', startCamera);
	document.getElementById('stopCamera').addEventListener('click', stopCamera);
	document.getElementById('captureFace').addEventListener('click', captureFace);

	// クローゼット画像の追加（ファイル入力）
	document.getElementById('addCloth').addEventListener('change', e=>{
		const f = e.target.files && e.target.files[0];
		if(f) addClosetItem(f);
		e.target.value = '';
	});

	// コーデ提案ボタン
	document.getElementById('makeProposal').addEventListener('click', makeProposal);
}


// showSection: 指定したセクションだけ表示し、他を非表示にするユーティリティ
function showSection(id){
	['faceSection','closetSection','proposeSection'].forEach(s=>{
		document.getElementById(s).classList.toggle('hidden', s!==id);
	});
}


// --- 天気取得（Open-Meteo を使用：APIキー不要） ---
// 位置情報を取得して Open-Meteo の current_weather を参照し、結果を表示する
async function updateWeather(){
	const el = document.getElementById('weather');
	el.textContent = '取得中… 位置情報の許可を求めます';
	if(navigator.geolocation){
		navigator.geolocation.getCurrentPosition(async pos=>{
			const lat = pos.coords.latitude.toFixed(4);
			const lon = pos.coords.longitude.toFixed(4);
			try{
				const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
				const r = await fetch(url);
				const j = await r.json();
				if(j && j.current_weather){
					const w = j.current_weather;
					// 簡易表示: 風速と気温を出力
					el.innerHTML = `現在: 風速 ${w.windspeed}m/s / 気温 ${w.temperature}°C (時刻 ${w.time})`;
				} else el.textContent = '気候情報を取得できませんでした';
			}catch(e){ el.textContent = '気候取得でエラーが発生しました'; }
		}, err=>{ el.textContent = '位置情報が許可されていません。手動で再試行してください'; });
	} else {
		el.textContent = '位置情報が利用できません';
	}
}


// --- 気分（ムード）選択 ---
// ボタンの見た目を切り替え、選択した値を localStorage に保存
function selectMood(btn){
	document.querySelectorAll('#moodButtons button').forEach(b=>b.classList.remove('active'));
	btn.classList.add('active');
	localStorage.setItem('selectedMood', btn.dataset.mood);
}


// --- カメラ / 顔撮影（簡易実装） ---
// 注意: 本プロトタイプは顔検出ライブラリを入れていないため、
// 簡易的にキャンバスの縦横比で顔タイプを判定するダミー実装です。
let stream = null;
async function startCamera(){
	const video = document.getElementById('camera');
	if(stream) return;
	try{
		stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
		video.srcObject = stream;
		document.getElementById('faceResult').textContent = 'カメラ起動中';
	}catch(e){ alert('カメラを開始できませんでした: '+e.message); }
}
function stopCamera(){
	if(!stream) return;
	stream.getTracks().forEach(t=>t.stop());
	stream = null;
	document.getElementById('camera').srcObject = null;
	document.getElementById('faceResult').textContent = 'カメラ停止';
}

// captureFace: ビデオフレームをキャンバスに描画してDataURLを保存
// その後、簡易判定（縦横比）で顔タイプを localStorage に保存
function captureFace(){
	const video = document.getElementById('camera');
	if(!video || !video.videoWidth) return alert('カメラを起動してください');
	const c = document.getElementById('faceCanvas');
	c.width = video.videoWidth; c.height = video.videoHeight;
	const ctx = c.getContext('2d');
	ctx.drawImage(video,0,0,c.width,c.height);
	const data = c.toDataURL('image/png');
	// 顔写真を localStorage に保存（サンプル用途）
	localStorage.setItem('facePhoto', data);
	// 簡易判定（顔縦横比に基づくダミー判定）
	const ratio = c.height / c.width;
	let faceType = '標準タイプ';
	if(ratio > 1.05) faceType = '縦長タイプ';
	else if(ratio < 0.9) faceType = '横広タイプ';
	localStorage.setItem('faceType', faceType);
	document.getElementById('faceResult').textContent = `判定結果：${faceType}`;
}


// --- クローゼット（localStorage に画像を保存して一覧表示） ---
function loadCloset(){
	const raw = localStorage.getItem('closetItems');
	const arr = raw ? JSON.parse(raw) : [];
	const grid = document.getElementById('closetGrid');
	grid.innerHTML = '';
	if(arr.length===0) grid.innerHTML = '<div style="color:#999">まだ服が登録されていません。画像を追加してください。</div>';
	arr.forEach((src,idx)=>{
		const img = document.createElement('img'); img.src = src;
		img.alt = `closet-${idx}`;
		const wrapper = document.createElement('div');
		wrapper.appendChild(img);
		grid.appendChild(wrapper);
	});
}

// addClosetItem: File オブジェクトを受け取り DataURL に変換して保存
// 最大 50 件まで保持する簡易実装
function addClosetItem(file){
	const reader = new FileReader();
	reader.onload = ()=>{
		const raw = localStorage.getItem('closetItems');
		const arr = raw ? JSON.parse(raw) : [];
		arr.unshift(reader.result);
		localStorage.setItem('closetItems', JSON.stringify(arr.slice(0,50)));
		loadCloset();
	};
	reader.readAsDataURL(file);
}


// --- コーデ提案（簡易） ---
// 登録済みの服画像からランダムに2点選び、提案と簡単なアドバイスを表示する
function makeProposal(){
	const raw = localStorage.getItem('closetItems');
	const arr = raw ? JSON.parse(raw) : [];
	const proposalEl = document.getElementById('proposal');
	const adviceEl = document.getElementById('advice');
	proposalEl.innerHTML = '';
	adviceEl.textContent = '';
	if(arr.length===0){ adviceEl.textContent = 'クローゼットが空です。服を登録してください。'; return; }
	// 簡易: ランダムに2点選ぶ
	const indices = new Set();
	while(indices.size < Math.min(2, arr.length)) indices.add(Math.floor(Math.random()*arr.length));
	indices.forEach(i=>{
		const img = document.createElement('img'); img.src = arr[i]; proposalEl.appendChild(img);
	});
	// アドバイス生成（天気・ムード・顔タイプから簡易メッセージ）
	const mood = localStorage.getItem('selectedMood') || '指定なし';
	const faceType = localStorage.getItem('faceType') || '未登録';
	adviceEl.textContent = `${mood}向け／顔タイプ: ${faceType} — シンプルに組み合わせてみました。実際の気温や気分に合わせ微調整をしてください。`;
}


