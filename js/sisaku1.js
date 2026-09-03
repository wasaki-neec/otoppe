/*
	sisaku1.js
	- プロトタイプの振る舞いを実装する軽量スクリプト
	- 以下の機能をサポートします:
		・UI初期化とイベント登録
		・位置情報からの天気取得（Open-Meteo）
		・気分（ムード）選択の保存
		・カメラ起動 / 撮影（MediaPipe Face Landmarkerで判定）
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
	document.getElementById('faceImage').addEventListener('change', event=>{
		const file = event.target.files && event.target.files[0];
		if(file) analyzeFaceImage(file);
		event.target.value = '';
	});

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


// --- カメラ / 顔撮影（MediaPipe Face Landmarker） ---
const faceLandmarkerModelUrl = './models/face_landmarker.task';
const faceLandmarkerModuleUrl = './vendor/tasks-vision.mjs';
const faceLandmarkerWasmUrl = './vendor/wasm';
let stream = null;
let faceLandmarker = null;

<<<<<<< HEAD
<<<<<<< HEAD:js/sisaku1.js
=======
>>>>>>> d614a1b (five-okame)
function showFaceDiagnostic(message){
	const noticeEl = document.getElementById('faceNotice');
	if(noticeEl) noticeEl.textContent = message;
}

<<<<<<< HEAD
=======
>>>>>>> 987886a (four-okame):sisaku1.js
=======
>>>>>>> d614a1b (five-okame)
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
<<<<<<< HEAD
<<<<<<< HEAD:js/sisaku1.js
=======
>>>>>>> d614a1b (five-okame)
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
<<<<<<< HEAD
=======
	const vision = await import(faceLandmarkerModuleUrl);
	const filesetResolver = await vision.FilesetResolver.forVisionTasks(faceLandmarkerWasmUrl);
	faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
		baseOptions:{modelAssetPath:faceLandmarkerModelUrl},
		outputFaceBlendshapes:true,
		outputFacialTransformationMatrixes:true,
		numFaces:1
	});
>>>>>>> 987886a (four-okame):sisaku1.js
=======
>>>>>>> d614a1b (five-okame)
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
<<<<<<< HEAD
<<<<<<< HEAD:js/sisaku1.js
		const detectionResult = landmarker.detect(canvas);
=======
		const detectionResult = landmarker.detect(c);
>>>>>>> 987886a (four-okame):sisaku1.js
=======
		const detectionResult = landmarker.detect(canvas);
>>>>>>> d614a1b (five-okame)
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
		resultEl.textContent = `判定結果：${faceType}`;
		document.getElementById('faceMetrics').textContent = [
			`顔の縦横比: ${features.faceRatio.toFixed(2)}`,
			`目の大きさ: ${(features.eyeSize * 100).toFixed(1)}%`,
			`目の間隔: ${(features.eyeDistance * 100).toFixed(1)}%`,
			`口の幅: ${(features.mouthWidth * 100).toFixed(1)}%`
		].join(' / ');
	}catch(error){
		console.error('Face Landmarkerの初期化または検出に失敗しました', error);
<<<<<<< HEAD
<<<<<<< HEAD:js/sisaku1.js
		const detail = error instanceof Error ? error.message : String(error);
		resultEl.textContent = '顔判別の準備に失敗しました';
		showFaceDiagnostic(`原因: ${detail} 実行元: ${location.href}`);
=======
		resultEl.textContent = '顔判別の準備に失敗しました。modelsとvendorの配置を確認してください';
>>>>>>> 987886a (four-okame):sisaku1.js
=======
		const detail = error instanceof Error ? error.message : String(error);
		resultEl.textContent = '顔判別の準備に失敗しました';
		showFaceDiagnostic(`原因: ${detail} 実行元: ${location.href}`);
>>>>>>> d614a1b (five-okame)
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


