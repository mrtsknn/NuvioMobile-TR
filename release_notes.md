# Nuvio Mobile TR - v0.6.12-tr.1

Türkçe içerik kaynakları ve eklentileriyle güçlendirilmiş Nuvio Mobile sürümü!

### 🌟 Öne Çıkan Özellikler ve Yenilikler:
- **7 Adet Türkçe Eklenti (SkyStream formatı):**
  - **SelcukFlix**
  - **DiziYou**
  - **SetFilm**
  - **FullHDFilmizlesene**
  - **Dizilla**
  - **WebDramaTurkey**
  - **YesilcamTV**
- **Bağımsız Katalog ve Kaynak Yönetimi:** Ana sayfada tek dokunuşla dilediğiniz sitenin kataloğunu veya yayın kaynağını seçebilme.
- **Sağlayıcı İçi Arama:** Arama sekmesinde tüm Türk eklentileri taranarak kategorize edilmiş arama sonuçları.
- **Site Yorumları:** İçerik detay sayfalarında kaynak sitenin gerçek kullanıcı yorumlarını görebilme.
- **Otomatik Cloudflare DoH DNS:** Türkiye ISP DNS engellerini aşmak için varsayılan DNS Cloudflare DoH olarak ayarlandı.
- **Eklenti Ayarları ve Alan Adı Değiştirme:** Değişen site alan adlarını doğrudan uygulama içinden güncelleyebilme ve test edebilme.

### 🔄 Upstream güncellemeleri (Nuvio Enhanced 0.6.5 → 0.6.12-beta):
- **Oynatıcı:** Bölüm (chapter) desteği iki motorda ve iOS'ta, Live TV için HLS kalite seçici, Live TV sonsuz tamponlama/siyah ekran düzeltmesi
- **Blu-ray:** ExoPlayer ile ISO/BDMV/M2TS oynatma
- **Altyazı:** Cihaza özel altyazı tercihleri, gölge/kontur/bulanıklık ayarları, zorunlu altyazı ve AutoSync varsayılan açık
- **Performans:** Seekbar küçük resimleri daha hızlı, iOS'ta 4K HDR/DV ve uzun oturumlarda bellek iyileştirmeleri
- **Senkron:** Simkl OAuth v2, MDBList önbellek, oturum yenileme başarısız olsa da girişte kalma
- **Diğer:** Anime keskinleştirici güçlendirildi, fragman sessize alma butonu sağ üstte, Discord RPC IMDb butonu düzeltildi

### 🛠️ TR Düzeltmeleri:
- **Hesapla giriş ve senkronizasyon** artık çalışıyor
- **NuvioTR önerileri** yeni listeden geliyor (NuvioTR/nuvio-tr-repos) — 10 yeni eklenti, 1 yeni katalog
- **Kaynak bağlamı** uygulama yeniden açıldığında da korunuyor; yorum destekli eklentilerde site yorumları Trakt olmadan da gösteriliyor
- Katalog başlıklarındaki **Türkçe karakter** sorunu (ç, ö, ü...) giderildi
- **DiziBox ve benzeri sitelerin posterleri** artık yükleniyor
- **SkyStream eklentileri 1.0.1:** temiz başlıklar, düzgün posterler, SelcukFlix / Dizilla / DiziYou / WebDramaTurkey aramaları düzeltildi, FullHDFilmizlesene Cloudflare engeli aşıldı

### 📦 İndirme Seçenekleri:
- **`Nuvio-TR-0.6.12-universal.apk`**: Tüm Android cihazlar ile uyumlu evrensel APK.
- **`Nuvio-TR-0.6.12-arm64-v8a.apk`**: Güncel 64-bit Android telefon ve tabletler için optimize edilmiş hafif paket.
- **`Nuvio-TR-0.6.12-armeabi-v7a.apk`**: Eski 32-bit Android cihazlar için.
- **`Nuvio-TR-0.6.12-x86_64.apk`**: Emülatörler ve x86_64 sistemler için.
- **`nuvio-tr-0.6.12-tr.1-release.ipa`**: iOS cihazlar için IPA paketi (AltStore, SideStore veya Sideloadly ile yüklenebilir).
