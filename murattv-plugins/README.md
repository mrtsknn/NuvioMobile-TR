# MuratTv Türk Kaynakları (Nuvio biçimi)

CloudStream (`.cs3`) Türkçe eklentilerinden çevrilen, cihazda çalışan Nuvio kaynakları.
MuratTv ve NuvioTR (iOS + Android) ile çalışır: yalnızca `fetch` ve (gerekirse) CryptoJS kullanır.

Depo adresi:

```
https://raw.githubusercontent.com/mrtsknn/NuvioMobile-TR/tr/murattv-plugins/manifest.json
```

| Kaynak | Tür | Oynatıcı |
|---|---|---|
| FullHDFilm | Film | videoseyred, hdload (HLS) |
| HDFilmCehennemi2 | Film, dizi | vidload, vidmoly (HLS) |
| UltraFilmizle | Film | hotstream bePlayer (AES) |
| RoketDizi | Dizi, film | pichive (PBKDF2/AES + iş kanıtı imzası) |
| Dizist | Dizi | pichive |

Kaynak akışları [BigBull CS](https://github.com/F0Rextasy/bigbullapp-cs) Kotlin eklentilerinden
çevrildi (MIT, © 2026 BigBull CS contributors). `skystream-plugins/` klasöründen bağımsızdır.
