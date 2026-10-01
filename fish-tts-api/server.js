import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY;
const MODEL_ID = process.env.MODEL_ID || 'a486dffae545463abb96c8ff9765fb43';

app.use(cors());
app.use(express.json());

// Serve static files trong thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, speed = 1 } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Nội dung văn bản không được để trống.' });
    }

    if (!FISH_AUDIO_API_KEY) {
      return res.status(500).json({ error: 'Chưa cấu hình FISH_AUDIO_API_KEY trong file .env' });
    }

    const payload = {
      text: text.trim(),
      reference_id: MODEL_ID,
      temperature: 0.7,
      top_p: 0.7,
      prosody: {
        speed: parseFloat(speed) || 1,
        volume: 0,
        normalize_loudness: true
      },
      chunk_length: 300,
      normalize: true,
      format: "mp3",
      sample_rate: 44100,
      mp3_bitrate: 128,
      latency: "normal",
      max_new_tokens: 1024,
      repetition_penalty: 1.2,
      min_chunk_length: 50,
      condition_on_previous_chunks: true,
      early_stop_threshold: 1
    };

    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FISH_AUDIO_API_KEY}`,
        'Content-Type': 'application/json',
        'model': 's2.1-pro-free'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fish Audio API Error:', errorText);
      return res.status(response.status).json({
        error: `Fish Audio API error: ${response.statusText}`,
        details: errorText
      });
    }

    // Nhận dữ liệu âm thanh mp3 và gửi lại client dạng audio/mpeg
    const audioBuffer = await response.arrayBuffer();
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.byteLength,
      'Cache-Control': 'no-cache'
    });

    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('Server Internal Error:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi máy chủ trong quá trình xử lý TTS.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});