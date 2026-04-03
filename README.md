# 🎓 ClearBoard — YouTube Lecture Note Helper

> **Never miss board notes again.** ClearBoard is a Chrome extension that automatically finds timestamps in YouTube lecture videos when the teacher steps away from the board — so you can pause, read, and take notes without frantically scrubbing through the video.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-brightgreen?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Made with ❤](https://img.shields.io/badge/Made%20with-%E2%9D%A4-red)

---

## ✨ The Problem

You're watching a lecture on YouTube. The professor writes something important on the board — but they're standing right in front of it. By the time they move, you've already missed it.

ClearBoard solves this by **scanning the video** and flagging every moment where the board is fully visible, so you can jump to those timestamps and take your notes at your own pace.

---

## 🚀 Features

- **⚡ Fast Scan** — Automatically seeks through the entire video and collects all clear-board timestamps before you even start watching
- **🔴 Live Watch** — Monitors the video in real-time as you watch and logs clear moments as they happen
- **📸 Reference Frame** — Capture a "clear board" snapshot to improve detection accuracy
- **🎯 Sensitivity Slider** — Fine-tune detection from strict to lenient depending on the lecture style
- **🕐 One-click Jump** — Click any timestamp in the list to instantly seek the video to that moment
- **⭐ Clarity Score** — Each timestamp is rated by how clear/unobstructed the board appears
- **📤 Export** — Save all timestamps as a `.txt` file for your notes
- **🎨 Dark UI** — Clean sidebar that matches YouTube's dark theme

---

## 🧠 How It Works

ClearBoard uses two computer vision techniques entirely in-browser — no server, no API, no data leaves your machine.

### 1. Skin Colour Detection *(automatic)*
Each video frame is sampled on a low-resolution canvas and analysed in the **YCbCr colour space**. Human skin has a well-known chrominance signature (`Cb ∈ [77, 127]`, `Cr ∈ [133, 173]`). If the central region of the frame has very few skin-coloured pixels, the board is likely unobstructed.

### 2. Histogram Comparison *(optional, more accurate)*
When you capture a reference frame (a moment when the board is perfectly clear), every subsequent frame's **colour histogram** is compared against it using the **Bhattacharyya coefficient**. A high similarity score combined with low skin presence = board clear.

Both signals are combined into a single score (0–1). The sensitivity slider adjusts the detection threshold.

```
Final Score = (Skin Score × 0.4) + (Histogram Match × 0.6)
```

---

## 📦 Installation

> Chrome Web Store submission coming soon. Install manually for now:

1. **Download** this repository as a ZIP and unzip it
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the unzipped folder
5. Done! A 🎓 button will now appear on all YouTube lecture pages

---

## 🎮 Usage

1. Open any YouTube lecture video
2. Click the floating **🎓** button on the right edge of the page to open the sidebar
3. *(Optional but recommended)* Pause on a frame with the board fully visible → click **📸 Capture** to set a reference
4. Adjust the **Sensitivity** slider to your preference
5. Choose a scan mode:
   - **▶ Live Watch** — samples every 2 seconds while you watch
   - **⚡ Fast Scan** — seeks through the full video automatically (best used before watching)
6. Click any timestamp in the list to jump directly to that moment
7. Use **Export** to download all timestamps as a `.txt` file

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| Reference Frame | Captures the current video frame as a "clear board" baseline for comparison |
| Sensitivity | Controls the threshold for what counts as "clear" — move right for more results |
| Scan Interval | How many seconds to skip between samples in Fast Scan mode (3 / 5 / 10 / 30 sec) |

---

## 💡 Tips

- **Blackboard lectures** work best — high contrast between chalk and board makes detection easier
- **Whiteboard lectures** also work well; setting a reference frame greatly improves accuracy
- If the teacher wears skin-toned clothing, use the **reference method** instead of relying only on skin detection
- For a 1-hour lecture, Fast Scan at 5-second intervals takes around 1–2 minutes
- Your playback position is **automatically restored** after a Fast Scan

---

## 🔒 Privacy

ClearBoard works entirely on your device using the browser's Canvas API. It does not:
- Send any data to external servers
- Record or store video frames
- Require any login or account

---

## 🗺️ Roadmap

- [ ] Upload to Chrome Web Store
- [ ] TensorFlow.js / MediaPipe integration for true person segmentation
- [ ] Visual timeline overlay directly on YouTube's progress bar
- [ ] Chapter-based grouping of clear moments
- [ ] Firefox support
- [ ] Support for other platforms (Google Meet recordings, Coursera, etc.)

---

## 🛠️ Tech Stack

- **Manifest V3** Chrome Extension
- **Canvas API** for frame capture
- **YCbCr colour space** for skin detection
- **Bhattacharyya coefficient** for histogram comparison
- Vanilla JS + CSS — zero dependencies

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

<p align="center">Built with ❤️ to make learning easier</p>
