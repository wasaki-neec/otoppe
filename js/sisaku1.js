/*
	sisaku1.js
	- このスクリプトは、服の登録・顔判定・天気取得を組み合わせたプロトタイプ画面の動作を定義する。
	- 実際には以下の処理を行う:
		・ページ読み込み時の初期化
		・位置情報からの天気取得（Open-Meteo）
		・ムード選択の保存
		・カメラまたは画像から顔を解析して「顔タイプ」を推定
		・服の画像を localStorage に保持して一覧表示
		・登録済み服からコーディネート案を自動生成
*/

// --- Dexie データベース設定 ---
// IndexedDB を使って、顔タイプとクローゼットの服情報をブラウザに保存する。
// localStorage だけでは容量や構造の制約があるため、Dexie を併用して管理する。
const db = (typeof Dexie !== 'undefined') ? new Dexie('FeelingCollectionDB') : null;
if (db) {
	db.version(1).stores({
		userProfile: 'id',
		clothes: 'id, category, season, scene, createdAt'
	});
}

async function ensureDexieReady() {
	if (!db) {
		return false;
	}
	try {
		await db.open();
		const statusEl = document.getElementById('dexieStatus');
		if (statusEl) statusEl.textContent = 'Dexie: 接続済み（IndexedDBで保存中）';
		return true;
	}catch(error){
		console.error('Dexie 初期化エラー:', error);
		const statusEl = document.getElementById('dexieStatus');
		if (statusEl) statusEl.textContent = 'Dexie: 接続に失敗しました';
		return false;
	}
}

async function saveFaceTypeToDexie(type) {
	if (!db) return;
	try {
		await db.userProfile.put({ id: 'user_profile', faceType: type, updatedAt: new Date().toISOString() });
	}catch(error){
		console.error('顔タイプのDexie保存に失敗:', error);
	}
}

async function getFaceTypeFromDexie() {
	if (!db) return null;
	try {
		const profile = await db.userProfile.get('user_profile');
		return profile?.faceType || null;
	}catch(error){
		console.error('顔タイプのDexie取得に失敗:', error);
		return null;
	}
}

async function syncClothToDexie(item) {
	if (!db) return;
	try {
		await db.clothes.put({
			...item,
			createdAt: item.createdAt || new Date().toISOString()
		});
	}catch(error){
		console.error('服データのDexie保存に失敗:', error);
	}
}

async function deleteClothFromDexie(id) {
	if (!db) return;
	try {
		await db.clothes.delete(id);
	}catch(error){
		console.error('服データのDexie削除に失敗:', error);
	}
}

async function getDexieClothes() {
	if (!db) return [];
	try {
		const items = await db.clothes.orderBy('createdAt').reverse().toArray();
		return items.map(item => ({
			id: item.id,
			name: item.name || item.title || '登録した服',
			category: item.category || '未分類',
			season: item.season || '通年',
			scene: item.scene || '指定なし',
			image: item.image || item.imageBase64 || '',
			createdAt: item.createdAt || new Date().toISOString()
		})).filter(item => item.image);
	}catch(error){
		console.error('Dexie からの服取得に失敗:', error);
		return [];
	}
}

// DOM が準備できたら初期化処理を実行する。
// つまり、HTML の要素が読まれた後に、UI のイベント登録・保存データ復元・現在の天気取得を順番に行う。
document.addEventListener('DOMContentLoaded', async ()=>{
	await ensureDexieReady();
	const defaultMood = getSelectedMood();
	applyMoodSelection(defaultMood);
	initUI();      // ボタンや入力にイベントを割り当てる
	await loadCloset();   // 保存済みのクローゼット画像を読み込んで画面に表示する
	updateWeather();// 現在の気候情報を取得して表示する
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
	document.getElementById('faceImage').addEventListener('change', event=>{
		const file = event.target.files && event.target.files[0];
		if(file) analyzeFaceImage(file);
		event.target.value = '';
	});

	// クローゼットへの服登録
	document.getElementById('closetForm').addEventListener('submit', event=>{
		event.preventDefault();
		const file = document.getElementById('addCloth').files[0];
		if(file) addClosetItem(file);
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
// まず app.py で保存された weather_cache.json があればそれを使い、
// なければ端末の位置情報から Open-Meteo を呼んで現在地の天気を取得する。
const WEATHER_CACHE_URL = './weather_cache.json';

function renderWeatherData(data, sourceLabel = '自動取得') {
	const el = document.getElementById('weather');
	const sourceEl = document.getElementById('weatherSource');
	if (!data) {
		el.textContent = '気候情報を取得できませんでした';
		if (sourceEl) sourceEl.textContent = `データソース: ${sourceLabel}`;
		return;
	}

	const temp = data.temperature ?? data.temp ?? '—';
	const feelsLike = data.feels_like ?? data.apparent_temperature ?? '—';
	const humidity = data.humidity ?? '—';
	const cityName = data.city || '現在地';
	const weatherText = data.weather_text || '天気情報';
	const feelingText = data.feeling_text || '服装の目安';

	el.innerHTML = `
		<div class="weather-summary">
			<strong>${cityName}</strong><br>
			気温: ${temp}°C / 体感: ${feelsLike}°C<br>
			湿度: ${humidity}% / 天気: ${weatherText}<br>
			服装: ${feelingText}
		</div>
	`;
	if (sourceEl) sourceEl.textContent = `データソース: ${sourceLabel}`;
}

async function loadWeatherFromCache() {
	try {
		const response = await fetch(WEATHER_CACHE_URL, { cache: 'no-store' });
		if (!response.ok) return null;
		const data = await response.json();
		if (data && (data.temperature !== undefined || data.temp !== undefined || data.city)) {
			return data;
		}
	} catch (error) {
		console.warn('weather_cache.json の読込に失敗:', error);
	}
	return null;
}

async function updateWeather(){
	const el = document.getElementById('weather');
	el.textContent = '取得中…';

	const cached = await loadWeatherFromCache();
	if (cached) {
		renderWeatherData(cached, 'app.py / weather_cache.json');
		return;
	}

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
					renderWeatherData({
						city: '現在地',
						temperature: w.temperature,
						feels_like: w.temperature,
						humidity: '—',
						weather_text: '現在の天気',
						feeling_text: '外の気温に合わせて調整',
					}, '位置情報 / Open-Meteo');
				} else {
					renderWeatherData(null, '位置情報 / Open-Meteo');
				}
			}catch(e){
				renderWeatherData(null, '位置情報 / Open-Meteo');
			}
		}, err=>{ 
			renderWeatherData(null, '位置情報拒否');
		});
	} else {
		renderWeatherData(null, '位置情報非対応');
	}
}


// --- 気分（ムード）選択 ---
// デフォルトは「普段」にして、選択したムードをコーデ提案ロジックが参照できるようにする。
const MOOD_PRIORITY = {
	'普段': ['普段着', '休日', '仕事', 'デート'],
	'仕事': ['仕事', 'フォーマル', '普段着'],
	'休日': ['休日', '普段着', 'デート'],
	'デート': ['デート', '休日', '普段着'],
	'リラックス': ['休日', '普段着'],
	'オフィスカジュアル': ['仕事', '普段着', 'フォーマル'],
	'フォーマル': ['フォーマル', '仕事', 'デート']
};

function getSelectedMood(){
	return localStorage.getItem('selectedMood') || '普段';
}

function applyMoodSelection(mood){
	document.querySelectorAll('#moodButtons button').forEach(b=>{
		const isActive = b.dataset.mood === mood;
		b.classList.toggle('active', isActive);
	});
	localStorage.setItem('selectedMood', mood);
	if (db) {
		db.userProfile.put({ id: 'selected_mood', mood, updatedAt: new Date().toISOString() }).catch(error => {
			console.error('ムードのDexie保存に失敗:', error);
		});
	}
}

function selectMood(btn){
	const mood = btn.dataset.mood;
	applyMoodSelection(mood);
}


// --- カメラ / 顔撮影（MediaPipe Face Landmarker） ---
const faceLandmarkerModelUrl = './models/face_landmarker.task';
const faceLandmarkerModuleUrl = '../vendor/tasks-vision.mjs';
const faceLandmarkerWasmUrl = './vendor/wasm';
let stream = null;
let faceLandmarker = null;

function showFaceDiagnostic(message){
	const noticeEl = document.getElementById('faceNotice');
	if(noticeEl) noticeEl.textContent = message;
}

function distanceBetween(firstPoint, secondPoint){
	const x = firstPoint.x - secondPoint.x;
	const y = firstPoint.y - secondPoint.y;
	return Math.hypot(x, y);
}

function getFaceFeatures(landmarks){
	const faceHeight = distanceBetween(landmarks[10], landmarks[152]);
	const faceWidth = distanceBetween(landmarks[234], landmarks[454]);
	const leftEyeWidth = distanceBetween(landmarks[33], landmarks[133]);
	const rightEyeWidth = distanceBetween(landmarks[362], landmarks[263]);
	const eyeDistance = distanceBetween(landmarks[133], landmarks[362]);
	const mouthWidth = distanceBetween(landmarks[61], landmarks[291]);
	const averageEyeWidth = (leftEyeWidth + rightEyeWidth) / 2;

	return {
		faceRatio:faceHeight / faceWidth,
		eyeSize:averageEyeWidth / faceWidth,
		eyeDistance:eyeDistance / faceWidth,
		mouthWidth:mouthWidth / faceWidth
	};
}

function classifyFace(features){
	const isLongFace = features.faceRatio >= 1.25;
	const hasLargeEyes = features.eyeSize >= 0.19;
	const hasWideEyeDistance = features.eyeDistance >= 0.28;
	const hasSmallMouth = features.mouthWidth < 0.34;

	if(hasLargeEyes && hasWideEyeDistance && hasSmallMouth) return '猫顔（推定）';
	if(hasLargeEyes && !isLongFace) return 'うさぎ顔（推定）';
	if(isLongFace) return '大人顔（推定）';
	return '標準タイプ（推定）';
}

async function getFaceLandmarker(){
	if(faceLandmarker) return faceLandmarker;
	if(location.protocol === 'file:'){
		throw new Error('file://で開かれています。ブラウザの制限により、ローカルのJS・WASM・モデルを読み込めません。localhostまたはHTTPSで開いてください');
	}
	let vision;
	try{
		vision = await import(faceLandmarkerModuleUrl);
	}catch(error){
		throw new Error(`MediaPipeモジュール読込失敗: ${faceLandmarkerModuleUrl} (${error.message})`);
	}
	let filesetResolver;
	try{
		filesetResolver = await vision.FilesetResolver.forVisionTasks(faceLandmarkerWasmUrl);
	}catch(error){
		throw new Error(`WASM読込失敗: ${faceLandmarkerWasmUrl} (${error.message})`);
	}
	try{
		faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
			baseOptions:{modelAssetPath:faceLandmarkerModelUrl},
			outputFaceBlendshapes:true,
			outputFacialTransformationMatrixes:true,
			numFaces:1
		});
	}catch(error){
		throw new Error(`顔モデル読込失敗: ${faceLandmarkerModelUrl} (${error.message})`);
	}
	return faceLandmarker;
}

async function startCamera(){
	const video = document.getElementById('camera');
	if(stream) return;
	if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
		document.getElementById('faceResult').textContent = 'この場所ではカメラを使えません。写真から判定してください';
		return;
	}
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

async function analyzeFaceCanvas(canvas){
	const data = canvas.toDataURL('image/png');
	// 顔写真を localStorage に保存（サンプル用途）
	localStorage.setItem('facePhoto', data);

	const resultEl = document.getElementById('faceResult');
	resultEl.textContent = '顔を解析中…';
	try{
		const landmarker = await getFaceLandmarker();
		const detectionResult = landmarker.detect(canvas);
		if(!detectionResult.faceLandmarks || detectionResult.faceLandmarks.length === 0){
			localStorage.removeItem('faceType');
			document.getElementById('faceMetrics').textContent = '';
			resultEl.textContent = '顔を検出できませんでした。正面を向いて撮影してください';
			return;
		}

		const landmarks = detectionResult.faceLandmarks[0];
		const firstLandmark = landmarks[0];
		const features = getFaceFeatures(landmarks);
		const faceType = classifyFace(features);
		const landmarkData = {
			x:firstLandmark.x,
			y:firstLandmark.y,
			z:firstLandmark.z,
			features,
			blendshapes:detectionResult.faceBlendshapes?.[0]?.categories || [],
			transformationMatrix:detectionResult.facialTransformationMatrixes?.[0]?.data || []
		};
		localStorage.setItem('faceLandmark', JSON.stringify(landmarkData));
		localStorage.setItem('faceType', faceType);
		await saveFaceTypeToDexie(faceType);
		resultEl.textContent = `判定結果：${faceType}`;
		document.getElementById('faceMetrics').textContent = [
			`顔の縦横比: ${features.faceRatio.toFixed(2)}`,
			`目の大きさ: ${(features.eyeSize * 100).toFixed(1)}%`,
			`目の間隔: ${(features.eyeDistance * 100).toFixed(1)}%`,
			`口の幅: ${(features.mouthWidth * 100).toFixed(1)}%`
		].join(' / ');
	}catch(error){
		console.error('Face Landmarkerの初期化または検出に失敗しました', error);
		const detail = error instanceof Error ? error.message : String(error);
		resultEl.textContent = '顔判別の準備に失敗しました';
		showFaceDiagnostic(`原因: ${detail} 実行元: ${location.href}`);
	}
}

// captureFace: ビデオフレームを検出し、最初の顔の特徴点を保存
async function captureFace(){
	const video = document.getElementById('camera');
	if(!video || !video.videoWidth) return alert('カメラを起動してください');
	const canvas = document.getElementById('faceCanvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
	await analyzeFaceCanvas(canvas);
}

function analyzeFaceImage(file){
	const image = new Image();
	image.onload = async ()=>{
		const canvas = document.getElementById('faceCanvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		canvas.getContext('2d').drawImage(image,0,0);
		await analyzeFaceCanvas(canvas);
		URL.revokeObjectURL(image.src);
	};
	image.onerror = ()=>{
		document.getElementById('faceResult').textContent = '画像を読み込めませんでした';
	};
	image.src = URL.createObjectURL(file);
}


// --- クローゼット（localStorage + Dexie に保存して一覧表示） ---
async function loadCloset(){
	const arr = await getClosetItems();
	const grid = document.getElementById('closetGrid');
	grid.innerHTML = '';
	if(arr.length===0){
		grid.textContent = 'まだ服が登録されていません。写真と服の情報を入力してください。';
		return;
	}
	arr.forEach(item=>{
		const img = document.createElement('img');
		img.src = item.image;
		img.alt = item.name;
		const wrapper = document.createElement('article');
		wrapper.className = 'closet-item';
		const name = document.createElement('h3');
		name.textContent = item.name;
		const details = document.createElement('p');
		details.textContent = `${item.category}・${item.season}・${item.scene}`;
		const actions = document.createElement('div');
		actions.className = 'closet-item-actions';
		const editButton = document.createElement('button');
		editButton.type = 'button';
		editButton.textContent = '編集';
		editButton.addEventListener('click', ()=>{
			wrapper.replaceChildren(img, createClosetEditForm(item));
		});
		const removeButton = document.createElement('button');
		removeButton.type = 'button';
		removeButton.textContent = '削除';
		removeButton.addEventListener('click', async ()=>{ await removeClosetItem(item.id); });
		actions.append(editButton, removeButton);
		wrapper.append(img, name, details, actions);
		grid.appendChild(wrapper);
	});
}

function createClosetEditForm(item){
	const form = document.createElement('form');
	form.className = 'closet-edit-form';
	const nameInput = document.createElement('input');
	nameInput.type = 'text';
	nameInput.maxLength = 40;
	nameInput.value = item.name;
	nameInput.required = true;
	const categorySelect = document.getElementById('clothCategory').cloneNode(true);
	categorySelect.value = item.category;
	const seasonSelect = document.getElementById('clothSeason').cloneNode(true);
	seasonSelect.value = item.season;
	const sceneSelect = document.getElementById('clothScene').cloneNode(true);
	sceneSelect.value = item.scene;
	const fields = [
		['服の名前', nameInput],
		['カテゴリ', categorySelect],
		['季節', seasonSelect],
		['シーン', sceneSelect]
	];
	fields.forEach(([labelText, control])=>{
		const label = document.createElement('label');
		label.append(labelText, control);
		form.appendChild(label);
	});
	const actions = document.createElement('div');
	actions.className = 'closet-edit-actions';
	const saveButton = document.createElement('button');
	saveButton.type = 'submit';
	saveButton.textContent = '変更を保存';
	const cancelButton = document.createElement('button');
	cancelButton.type = 'button';
	cancelButton.textContent = 'キャンセル';
	cancelButton.addEventListener('click', loadCloset);
	actions.append(saveButton, cancelButton);
	form.appendChild(actions);
	form.addEventListener('submit', async event=>{
		event.preventDefault();
		const items = await getClosetItems();
		const updatedItems = items.map(existing=>existing.id === item.id ? {
			...existing,
			name:nameInput.value.trim(),
			category:categorySelect.value,
			season:seasonSelect.value,
			scene:sceneSelect.value
		} : existing);
		try{
			localStorage.setItem('closetItems', JSON.stringify(updatedItems));
			if (db) {
				await db.clothes.put({
					id: item.id,
					name: nameInput.value.trim(),
					category: categorySelect.value,
					season: seasonSelect.value,
					scene: sceneSelect.value,
					image: item.image,
					createdAt: item.createdAt || new Date().toISOString()
				});
			}
			await loadCloset();
			document.getElementById('closetStatus').textContent = '変更を保存しました。';
		}catch(error){
			document.getElementById('closetStatus').textContent = '変更を保存できませんでした。';
		}
	});
	return form;
}

async function getClosetItems(){
	if (db) {
		const dexieItems = await getDexieClothes();
		if (dexieItems.length > 0) return dexieItems;
	}
	const raw = localStorage.getItem('closetItems');
	if(!raw) return [];
	try{
		const items = JSON.parse(raw);
		if(!Array.isArray(items)) return [];
		return items.map((item, index)=>{
			if(typeof item === 'string'){
				return {id:`legacy-${index}`, name:'登録した服', category:'未分類', season:'通年', scene:'指定なし', image:item};
			}
			return {...item, id:item.id || `closet-${index}`, image:item.image || item.src || ''};
		}).filter(item=>item.image);
	}catch(error){
		console.error('クローゼットのデータを読み込めませんでした', error);
		return [];
	}
}

// 画像と入力情報を localStorage + Dexie に保存し、最大 50 件まで保持
async function addClosetItem(file){
	const status = document.getElementById('closetStatus');
	if(!file.type.startsWith('image/')){
		status.textContent = '画像ファイルを選択してください。';
		return;
	}
	const reader = new FileReader();
	reader.onload = async ()=>{
		const item = {
			id:`closet-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
			name:document.getElementById('clothName').value.trim(),
			category:document.getElementById('clothCategory').value,
			season:document.getElementById('clothSeason').value,
			scene:document.getElementById('clothScene').value,
			image:reader.result,
			createdAt:new Date().toISOString()
		};
		try{
			const items = await getClosetItems();
			items.unshift(item);
			localStorage.setItem('closetItems', JSON.stringify(items.slice(0,50)));
			await syncClothToDexie(item);
			document.getElementById('closetForm').reset();
			status.textContent = '服を登録しました。';
			await loadCloset();
		}catch(error){
			status.textContent = '保存できませんでした。画像のサイズを小さくして再度お試しください。';
		}
	};
	reader.onerror = ()=>{ status.textContent = '画像を読み込めませんでした。'; };
	reader.readAsDataURL(file);
}

async function removeClosetItem(id){
	const items = (await getClosetItems()).filter(item=>item.id !== id);
	localStorage.setItem('closetItems', JSON.stringify(items));
	await deleteClothFromDexie(id);
	await loadCloset();
}


// --- コーデ提案 ---
// カテゴリごとに1点選び、未登録のカテゴリも空の枠として表示する
async function makeProposal(){
	const arr = await getClosetItems();
	const proposalEl = document.getElementById('proposal');
	const adviceEl = document.getElementById('advice');
	proposalEl.innerHTML = '';
	adviceEl.textContent = '';
	const slots = [
		{label:'頭', categories:['帽子','顔周りのアクセ','顔周りの小物']},
		{label:'服上', categories:['トップス','アウター','ワンピース']},
		{label:'服下', categories:['ボトムス','スカート']},
		{label:'靴', categories:['靴']},
		{label:'アクセ', categories:['アクセサリー','アクセ','小物','靴・小物']}
	];
	const mood = getSelectedMood();
	const preferredScenes = MOOD_PRIORITY[mood] || [mood, '普段着'];
	const upperChoices = arr.filter(item => ['トップス', 'アウター', 'ワンピース'].includes(item.category));
	const moodUpperChoices = upperChoices.filter(item =>
		preferredScenes.includes(item.scene) || item.scene === '指定なし'
	);
	const upperCandidates = moodUpperChoices.length ? moodUpperChoices : upperChoices;
	const selectedUpper = upperCandidates[Math.floor(Math.random() * upperCandidates.length)] || null;
	const isDressChosen = selectedUpper?.category === 'ワンピース';

	function getCandidates(categories){
		const matchingItems = arr.filter(item => categories.includes(item.category));
		const moodItems = matchingItems.filter(item =>
			preferredScenes.includes(item.scene) || item.scene === '指定なし'
		);
		return moodItems.length ? moodItems : matchingItems;
	}

	slots.forEach(slot=>{
		if (slot.label === '服下' && isDressChosen) return;

		const wrapper = document.createElement('article');
		wrapper.className = 'proposal-slot';
		const heading = document.createElement('h3');
		heading.textContent = slot.label;
		const content = document.createElement('div');
		content.className = 'proposal-slot-content';

		const candidates = slot.label === '服上'
			? (selectedUpper ? [selectedUpper] : [])
			: getCandidates(slot.categories);

		if(candidates.length){
			const item = candidates[Math.floor(Math.random()*candidates.length)];
			const img = document.createElement('img');
			img.src = item.image;
			img.alt = item.name;
			const name = document.createElement('p');
			name.className = 'proposal-item-name';
			name.textContent = item.name;
			content.append(img);
			wrapper.append(heading, content, name);
		}else if (slot.label === '服下'){
			const message = document.createElement('p');
			message.className = 'proposal-item-name';
			message.textContent = 'ボトムスまたはスカートを登録してください。';
			content.appendChild(message);
			wrapper.append(heading, content);
		}else{
			wrapper.append(heading, content);
		}
		proposalEl.appendChild(wrapper);
	});
	if(arr.length===0){ adviceEl.textContent = 'クローゼットが空です。服を登録してください。'; return; }
	const faceType = localStorage.getItem('faceType') || '未登録';
	adviceEl.textContent = `${mood}向け／顔タイプ: ${faceType} — 選ばれた服は${mood}に合わせて調整しています。気温やその日の気分に合わせて微調整してください。`;
}


