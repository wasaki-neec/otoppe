# --- このスクリプトの役割 ---
# Streamlit アプリとして動作し、Open-Meteo API から都市ごとの現在の気温・湿度・天気コードを取得して
# 画面上に表示する。ユーザーが都市を選ぶと、その都市のデータを取得して体感温度と服装の目安までまとめて提示する。

import json
from pathlib import Path

import streamlit as st
import requests

WEATHER_CACHE_PATH = Path(__file__).with_name("weather_cache.json")


def save_weather_snapshot(city_name, lat, lon, weather_data):
    """天気情報を JSON 形式で保存し、HTML/JS 側でも使えるようにする。"""
    payload = {
        "city": city_name,
        "lat": lat,
        "lon": lon,
        "updatedAt": __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        "temperature": weather_data.get("temperature"),
        "feels_like": weather_data.get("feels_like"),
        "humidity": weather_data.get("humidity"),
        "weather_code": weather_data.get("weather_code"),
        "weather_text": weather_data.get("weather_text"),
        "feeling_text": weather_data.get("feeling_text"),
        "source": "app.py"
    }
    WEATHER_CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    return payload

# --- ページ設定 ---
st.set_page_config(
    page_title="Open-Meteo 天気・体感モニター",
    page_icon="🌤️",
    layout="centered"
)

st.title("🌤️ リアルタイム天気・体感モニター")
st.caption("Open-Meteo APIを利用して、APIキー不要でリアルタイムの気象データを取得します。")

# --- 日本の主要都市の緯度・経度リスト ---
CITIES = {
    "東京": {"lat": 35.6895, "lon": 139.6917},
    "大阪": {"lat": 34.6937, "lon": 135.5023},
    "名古屋": {"lat": 35.1815, "lon": 136.9066},
    "福岡": {"lat": 33.5904, "lon": 130.4017},
    "札幌": {"lat": 43.0621, "lon": 141.3544},
    "仙台": {"lat": 38.2682, "lon": 140.8694},
    "沖縄(那覇)": {"lat": 26.2124, "lon": 127.6809}
}

# --- Open-Meteoの天気コード(WMO Code)を日本語とアイコンに変換する関数 ---
def decode_weather_code(code):
    """WMO天気コードを日本語表記と絵文字に変換"""
    if code == 0:
        return "快晴 ☀️"
    elif code in [1, 2]:
        return "晴れ〜時々曇り 🌤️️"
    elif code == 3:
        return "曇り ☁️"
    elif code in [45, 48]:
        return "霧 🌫️"
    elif code in [51, 53, 55, 56, 57]:
        return "霧雨 🌧️"
    elif code in [61, 63, 65, 66, 67]:
        return "雨 ☔"
    elif code in [71, 73, 75, 77]:
        return "雪 ❄️"
    elif code in [80, 81, 82]:
        return "にわか雨 🌧️"
    elif code in [85, 86]:
        return "にわか雪 ☃️"
    elif code in [95, 96, 99]:
        return "雷雨 ⚡"
    else:
        return "不明 ❓"

# --- 気温と湿度から「暑さ・寒さ（体感）」を判定する関数 ---
def get_temperature_feeling(temp, humidity):
    """気温(℃)と湿度(%)から体感や服装の目安を判定"""
    if temp >= 30:
        return "🔥 猛暑（熱中症に注意・涼しい半袖やノースリーブ）"
    elif temp >= 25:
        if humidity >= 70:
            return "💦 蒸し暑い（半袖・通気性の良い服）"
        return "☀️ 夏日（半袖で過ごせる気候）"
    elif temp >= 20:
        return "🌱 快適（長袖シャツや薄手のカットソーがちょうど良い）"
    elif temp >= 15:
        return "🍂 肌寒い（カーディガンやライトアウターが必要）"
    elif temp >= 10:
        return "🧥 寒い（トレンチコートやジャケットが必要）"
    else:
        return "❄️ 極寒（ダウンジャケットや防寒具必須）"

# --- メイン画面 ---
selected_city = st.selectbox("📍 都市を選択してください", list(CITIES.keys()))

lat = CITIES[selected_city]["lat"]
lon = CITIES[selected_city]["lon"]

try:
    # Open-Meteo API URL (APIキー不要)
    # current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code
    url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code"
    
    response = requests.get(url, timeout=5)
    data = response.json()

    if "current" in data:
        current = data["current"]
        
        # 各データの抽出
        temp = round(current["temperature_2m"])            # 気温(℃)
        feels_like = round(current["apparent_temperature"]) # 体感温度(℃)
        humidity = round(current["relative_humidity_2m"])   # 湿度(%)
        weather_code = current["weather_code"]             # 天気コード
        
        weather_text = decode_weather_code(weather_code)
        feeling_text = get_temperature_feeling(temp, humidity)

        save_weather_snapshot(
            selected_city,
            lat,
            lon,
            {
                "temperature": temp,
                "feels_like": feels_like,
                "humidity": humidity,
                "weather_code": weather_code,
                "weather_text": weather_text,
                "feeling_text": feeling_text,
            },
        )

        # --- 画面にカード表示 ---
        st.write("---")
        weather_box = st.container(border=True)
        with weather_box:
            col1, col2 = st.columns([1, 1])
            
            with col1:
                st.metric(
                    label=f"現在の気温 ({selected_city})", 
                    value=f"{temp} ℃", 
                    delta=f"体感 {feels_like}℃"
                )
                st.caption(f"天気: {weather_text} / 湿度: {humidity}%")
                
            with col2:
                st.markdown("**【体感・服装の目安】**")
                st.info(feeling_text)

    else:
        st.error("天気データの取得に失敗しました。")

except Exception as e:
    st.error(f"エラーが発生しました: {e}")