import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# 1. オプションの設定
base_options = python.BaseOptions(model_asset_path='face_landmarker.task')
options = vision.FaceLandmarkerOptions(
    base_options=base_options,
    output_face_blendshapes=True,  # 表情（ブレンドシェイプ）の取得
    output_facial_transformation_matrixes=True, # 顔の向き・位置行列の取得
    num_faces=1  # 検出する最大人数
)

# 2. インスタンスの作成
with vision.FaceLandmarker.create_from_options(options) as landmarker:
    # 3. 画像の読み込み（OpenCVを使用）
    image = mp.Image.create_from_file('path_to_your_image.jpg')

    # 4. ランドマークの検出
    detection_result = landmarker.detect(image)

    # 5. 結果の確認（最初の顔の、最初の特徴点座標を表示）
    if detection_result.face_landmarks:
        first_landmark = detection_result.face_landmarks[0][0]
        print(f"X: {first_landmark.x}, Y: {first_landmark.y}, Z: {first_landmark.z}")
