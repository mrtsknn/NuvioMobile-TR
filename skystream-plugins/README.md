# NuvioTR SkyStream Eklenti Deposu

Bu klasör, CloudStream (`.cs3`) Türkçe eklentilerinin **NuvioTR (iOS + Android)** üzerinde çalışabilmesi için **SkyStream (`.sky` / `.js`)** formatına dönüştürülmüş versiyonlarını içerir.

## 📦 Mevcut Eklentiler (7 Sağlayıcı)

1. **DiziYou** (`diziyou.js` / `DiziYou.sky`): Yabancı ve yerli dizi arşivi, bölümler, kategoriler.
2. **FullHDFilmizlesene** (`fullhdfilmizlesene.js` / `FullHDFilmizlesene.sky`): Güncel yabancı filmler ve yerli yapımlar.
3. **SelcukFlix** (`selcukflix.js` / `SelcukFlix.sky`): Dizi ve film akışları.
4. **SetFilm** (`setfilm.js` / `SetFilm.sky`): HD film ve dizi sağlayıcısı, canlı arama desteği.
5. **Dizilla** (`dizilla.js` / `Dizilla.sky`): Yabancı popüler diziler ve sezon/bölüm kaynakları.
6. **WebDramaTurkey** (`webdramaturkey.js` / `WebDramaTurkey.sky`): Asya, Kore ve web dizileri.
7. **YesilcamTV** (`yesilcamtv.js` / `YesilcamTV.sky`): Türk sineması ve klasik Yeşilçam filmleri, Rumble oynatıcı.

## 🚀 Nasıl Kullanılır?

1. Bu klasördeki dosyaları kendi GitHub deponuza (örneğin `https://github.com/KULLANICI_ADI/skystream-plugins`) yükleyin.
2. GitHub RAW `repo.json` bağlantınızı kopyalayın:
   ```
   https://raw.githubusercontent.com/KULLANICI_ADI/skystream-plugins/main/repo.json
   ```
3. NuvioTR uygulamasında **Ayarlar ➔ Eklentiler ➔ Depo Ekle** kısmına bu bağlantıyı yapıştırın.
4. Uygulama `SkyStreamPackage.kt` üzerinden tüm eklentileri otomatik olarak kuracaktır.

## 🛠️ Yeniden Paketleme

Eğer `.js` dosyalarında bir değişiklik yaparsanız:
```bash
python skystream-plugins/package_all.py
```
komutu ile tüm `.sky` zip paketlerini tek seferde güncelleyebilirsiniz.

