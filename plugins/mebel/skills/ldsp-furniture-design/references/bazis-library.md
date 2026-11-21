# БАЗИС-Мебельщик 11: библиотеки фурнитуры, крепежа, текстур и материалов (исследование 2026-09-13)

Цель: чтобы скил проектирования (а) видел, что уже есть у пользователя, и (б) умел создавать недостающее.
Всё ниже собрано только чтением: файлы в `Documents\Bazis11` и `Downloads` не менялись, UI Базиса не трогался.
Резидентный агент на момент исследования был **не запущен** (`bz.ps1 -Status`: AGENT NOT RUNNING, BAZIS pid=9612 отвечает), поэтому проверок `typeof` внутри Базиса не было. Всё про API проверено только по `index.d.ts`, `types.js`, примерам и `Script.pdf`.

Пометки: **[проверено]** значит подтверждено файлами или официальным d.ts/примерами. **[предположение]** значит логичный вывод, который нужно подтвердить в Базисе.

---

## 0. Коротко

- Пути библиотек заданы в `%APPDATA%\Bazis11\Settings.xml`, блок `<Paths>` **[проверено]**:
  - `PathFastener = Documents\Bazis11\Фурнитура\`, фильтр `.f3d.config` (панель "Крепеж, фурнитура");
  - `PathFRW = Documents\Bazis11\Фрагменты\`, фильтр `.fr3d.frw`;
  - `PathTEMPLATES = ...\Templates\` (`.ldwt.b3dt.f3dt`, папка пуста);
  - `PathDOORS` и `PathBOXES` = корень `Bazis11` (`.bdl`, `.bbb`);
  - `PathMtBase` пуст, фактическая база задана в `BaseSettings.xml`: `DBName = ...\Учебная база материалов\Учебная база материалов.fdb`.
- **Важно про фильтры.** В Фурнитуре лежат 2211 `.fr3d` (AQ/Grade/GTV), а фильтр панели там `.f3d.config`, так что в панели "Крепеж, фурнитура" их не видно. В Фрагментах лежат 444 `.f3d` (Firmax), а фильтр там `.fr3d.frw`, их тоже не видно. Readme Firmax прямо советует поставить фильтр `*` **[проверено: Settings.xml + readme]**.
- База материалов: Firebird 2.5 (`УЧЕБНАЯ БАЗА МАТЕРИАЛОВ.FDB`, 13.4 МБ). Работают службы `FirebirdServerBazisSoftBuild` и `FirebirdGuardianBazisSoftBuild`, есть `isql.exe` и `gbak.exe` в `C:\Program Files (x86)\BazisSoft\BazisFirebird 2.5\bin`. Строки хранятся в UTF-8. Импортированы Egger (174 разные текстуры `egger\*.jpg`), Rehau (85), "ЛДСП Центр" (Гикори Шайн). **Не** импортированы Skif, AGT, Дятьково, Русский Ламинат, СоюзБалтКомплект, а также TBM.xml от Firmax (артикулов `FRM0001` в FDB нет) **[проверено сканом байтов FDB без подключения]**.
- Скриптового API для записи в базу материалов **нет**. Для новых фурнитуры и крепежа из скрипта доступны только сборка геометрии (`NewFurniture()`, `AddPanel`/`AddExtrusion`/`AddTrajectory`, `SaveModel`) и установка готовых файлов (`OpenFurniture(...).Mount*`). Отверстий и присадки в API нет.
- Много фурнитуры лежит у пользователя **нераспакованной**: 53 `model_*.exe` (это RAR SFX), 35 rar и 22 zip в `Фурнитура` (Boyard, Grass, Hettich, Samet, Kessebohmer, TALISMAN, СЛОРОС, AKS, Makmart, Starax, GELONY, Stilos, MODUS, Samsung-Irex, Модерн Стайл, ТБМ). Внутри около 30 тыс. файлов f3d/fr3d. Оглавления снимались через `UnRAR.exe lb` и `ZipFile.Open(Read)` без распаковки.
- Поиск по библиотеке: `find_library.ps1` (лежит рядом, только чтение), раздел 6.

---

## 1. Форматы файлов

| Расширение | Что это | Где | Внутреннее устройство |
|---|---|---|---|
| `.f3d` | Фурнитура или крепёж: ставится на стык панелей или на плоскость через `Mount`/`Mount1`, есть в спецификации как изделие | Фурнитура, частично Фрагменты | Контейнер `BZ85`. Словарь полей: `ID, Code, Name, Color, Header, Article, Version, FileType, DatumMode, ExtraInfo, Furniture, LDistance, Thumbnail(PNG), RotationList, AllowSymmetry, BuildAccuracy, ForEstimate`. Имя модели хранится в UTF-16 **[проверено]** |
| `.fr3d` | Фрагмент: блок или сборка для вставки (ящик в сборе, секция, петля с планкой) | Фрагменты, Фурнитура (AQ/GTV) | Тоже `BZ85`, дополнительно `FurnType, UseInCNC, UseInDocs, UseInCutting, UseInEstimate, AssemblyUnit, SchemeAsm, DrawingAsm, IgnoreInDrawings` **[проверено]** |
| `.b3d` | Модель | корень, кухмод | `BZ85` |
| `.frw` | 2D-контур или сечение (профили, плинтусы, силуэты техники) | Фрагменты\Сечения профилей, кухмод | Сигнатура `*BAZIS*FRW*`; грузится через `Contour2D.Load(file)` **[проверено d.ts]** |
| `Fasteners.config` | База **параметрического крепежа и схем** | Фурнитура | Бинарная сериализация (`01 00 00 FF`, словарь имён полей, строки UTF-16LE). Формат не документирован |
| `Furniture.config` | Параметры мастеров: ручки, опоры, навесы, купе-профили, ролики, лифты, штанги | Фурнитура | Тот же бинарный формат |
| `Doors.bdl` | Библиотека дверей (купе и распашных), мастер дверей | корень Bazis11 (фактически `Библиотека дверей\`) | Тот же бинарный формат (поля `Mat, Top, UID, Clip, Stop, Type...`) |
| `Boxes.bbb` | Библиотека ящиков, мастер ящиков | `Библиотека ящиков\` | То же (`Fast, SysBox, Thick, Depth...`) |
| `*.xml` (Database/Materials/Material) | Файл **импорта номенклатуры** в базу материалов | Текстуры\*\*.xml, Downloads\ТБМ Firmax\TBM.xml, BLUM | UTF-8 XML, раздел 3 |
| `*.dbf` | Номенклатура для импорта из DBF (GTV, AQ, МДМ) | Фурнитура | Поля `ITEMCODE, ITEMNAME, GRP_CODE, GRP_NAME, UNITNAME, PRICE, LENGTH, WIDTH, THICKNESS, SIGN, COLOR, TEXTURE, SYNC_EXTER, STRETCH, MIRRORED, STEPX, STEPY, ANGLE`, кодировка cp866 **[проверено]** |
| `Изображение крепежа\*.jpg/bmp` | Иконки видов крепежа для диалогов (Гвоздь, евровинт, Лифт, Опора, Петля, Петля для стекла, Полкодержатель(+для стекла), Ручка-кнопка, Ручка-скоба, Шкант, эксцентрик) | | 13 картинок |

---

## 2. Инвентаризация `Documents\Bazis11`

### 2.1 Фурнитура (3622 файла, 3.2 ГБ; из них 2 ГБ приходится на exe и архивы)

Распаковано и доступно:

| Папка | Файлов | Состав |
|---|---|---|
| **AQ, Grade и Ordi** | 577 | Выпрямители фасадов AQ (168); Карго AQ (6); Направляющие шариковые H45 45кг AQ (29), H53 100кг (19); Опора регулируемая H=39 (4); **Петли AQ** (72: +45, +155, накладные/вкладные, clip, с доводчиком); **Петли Grade** (26); Ручки-профили торцевые Outline (3); Gola-X AQ (10); **Ящики LineBox AQ** (73); Направляющие скрытого монтажа AQ (67); Шариковые GRADE (36); Навес Hold AQ (13); Петли Ordi slide-on (2 rar); Толкатели AQ (26) и Ordi; Шариковая H45 Push-to-open WL (21). Номенклатура в `.dbf` рядом. В основном `.fr3d` |
| **Фурнитура GTV** (GTV to Bazis v4.02, 08.2024) | 1754 | Фрагменты: Гардеробные системы (149), Кухонное наполнение (41), Направляющие скрытого монтажа (124), Направляющие шариковые (137), **Подъемные механизмы** (497), Профили Vello (54, купе/рамочные), Axis PRO (276), Axis Pro Glass (39), Metallbox MP (120), Modern Box Pro New (112), **Системы петель** (193). Плюс `GTV.dbf` (1228 позиций номенклатуры) и `Текстуры\GTV` (11 jpg цветов боковин) |
| **Фурнитура МДМ** | 1161 | `МДМ\Фурнитура`: 01 Метизы (Винты, Гайки, Дюбели, **Евровинты** 6, Заглушки 54, Саморезы 28, Шпильки); 02 Стяжки (Брус, Для столешниц 15, **Коническая** 25, **Конфирмат** 26 с KON 5x40...7x70 Marcopol, Кроватная, **Межсекционная** 16, Бочонок, Стяжка-полкодержатель, **Уголки** 29, Футорки, **Шканты** 9, **Эксцентриковая** 32 и усиленная 36, Permo EC02/03/04/18/22 + штоки TE01-TE13); 03 Стекло/зеркала (36); 04 **Полкодержатели** (199: ДСП, стекло, менсолодержатели); 08 **Ручки** (369: капли, кнопки, раковины, рейлинги, скобы 196); 10 **Опоры** (78: декоративные, для столов, регулируемые). Плюс Cinetto PS48 (64), IKM80AY (21), `База материалов\mdm.dbf`. Все `.f3d` |
| Опоры | 15 | Ножки 100-125, PI-04/05/09, ножка-ролик, NA10/NA11, NZ0204, опоры для стола |
| Ручки | 16 | врезные D50 (4 цвета), кнопки Р002 (5), скобы 128 бук, хром, Р366В |
| Полкодержатели | 2 | D5 никель, P323-01 хром |
| Крючки | 2 | вешалка шляпная, вешалка-крючок |
| Штанги выдвижные | 3 | ШТ 224/288/352 |
| `Furniture.config` | | параметрические: ручки, ножки/опоры, навес регулируемый, проушины, подпятники, замок 42x42, **купе-профили Komandor/Rm+/Double/OMGE** (профили, направляющие, ролики, щётки, тормоз), лифты газовые KRABY 164/355, профиль 1031, штанга ШТ 352 |

**Нераспакованные пакеты производителей** (в скобках f3d / fr3d по оглавлению):

- **Boyard**: model_Boyard (1094/0), BOYARD_DB (58/238), Petel (121/204), Planum (16/0), Setka (172/92), Slide (60/253), Start (122/512).
- **Grass**: model_Grass_ (2899/3541), DWD-XP (348/645), Dynamoov, Dynapro, Kinvaro, Kinvaro T-Slim, Nova-Pro Deluxe (345/619), Nova-Pro Scala (638/971).
- **Hettich** (zip): AvanTech YOU (688/1539), Направляющие (397/317), Sensys (303/950), SlideLine M, TopLine L/XL, Veosys, Atira (454/1374), WingLine 230/L, model_Hettich.exe (150/0).
- **Samet**: Samet (337), Samet2 (229/552), Samet2024 (62/124), D-Lite, Smartflow Alphabox (1124), SMT.
- **ТБМ**: Firm (152/154), **Firmax** (435/1091; уже установлен в Фрагменты), Logica (8/201), TOPSTAY (174/163).
- **Kessebohmer** (786 МБ: 480/609), **TALISMAN** (263 МБ: 310/623), **Модерн Стайл** (259/382), **SAMSUNG-IREX** (156/151), **Lemax PROF** (244/89), **GELONY** (67/100), **Stilos** (37/64), **MODUS** (58/88), **Starax** zip (16/35).
- **СЛОРОС**: slr_media_3d_bazis_11 zip (267/214), CUBO (29 fr3d), петли B-type и T-type, Titus System 6, Tekform Slimline.
- **Каталоги AKS** (rar): навесы, кухонное наполнение, направляющие, опоры, подъёмники, системы выдвижения, GOLA, "База 3D моделей" (102/272), "База материалов" xml, петли (41).
- **Makmart**: EVOLIFT flap/fold/swing, INDIGO, Strike M, Simple Box, Salice Silentia 700, сушки INOXA/VIVA, NORDIC.7z (7-Zip на машине нет, но есть WinRAR).
- **МДМ** exe (Cinetto PS03-PS65, IKM, Laguna, MiniCabinet, Fast): частично уже распакованы в `Фурнитура МДМ\МДМ`.

Почти в каждом пакете есть `.xml` или `.dbf` для импорта номенклатуры в базу материалов.

### 2.2 Фрагменты (2852 файла, 385 МБ; fr3d 2365, f3d 444, frw 39)

| Папка | Файлов | Состав |
|---|---|---|
| **BLUM\Antarion** | 906 | AMBIA-LINE 55; AVENTOS HF 48, HF Servo 15, HK 33, HK Servo 15, **HK top 73**, HK top Servo 54, HK-S 31, HK-XS 14, HL 26, HL Servo 20, HS 17, HS Servo 16, аксессуары 7; BLUMOTION/TIP-ON 51; CABLOXX 1; **LEGRABOX 176**; METABOX 16 мм 56 и 18 мм 56; **MOVENTO 90**; ORGA-LINE 52. Плюс 2 xml базы материалов Antarion |
| **Направляющие** (Firmax) | 301 | Роликовые 52, Скрытые 3D-Control с доводчиком 25 и с толкателем 21, Скрытые Ecomotion 21, Скрытые с доводчиком 19 мм 27 и обычные 27, **Шариковые 30** (NL 250...600), с доводчиком 25, с толкателем 25, Элементы для ящика 42 |
| **Петли** (Firmax) | 93 | Click-On 27, ClickLine 32, Slide-On 34 (накладные, вкладные, полунакладные, планки) |
| **Системы выдвижения** (Firmax) | 1132 | Newline 687, Slimline 180, Боковины на роликовых 265 |
| **кухмод** | 349 | Верхние 5, Верхние пеналы 145, Нижние 16, Нижние пеналы 183 (готовые кухонные модули; в "Глубина 510мм" есть силуэты варочных, вытяжек, холодильников в `.frw`) |
| Сечения профилей | 18 frw | Плинтусы кухонные 4, Double 2, OMGE 3, Raum 4 (направляющие купе, профили-ручки), МДФ 4, НП-121 |
| Прочее | | Заглушки 1, Замки 2, Карусели 2, Крючки 2, Мойки 2, Опоры 15, Ручки 16, Светильники 3, Сушилки 3, Трубы 2, Штанги 3 |

### 2.3 Fasteners.config (параметрический крепёж и схемы) [проверено декодированием UTF-16]

Группы и элементы:
- **Уголки**: Уголок.
- **Евровинты**: Евровинт 6х50.
- **Полкодержатели**: Полкодержатель D5 никель.
- **Шканты**: Шкант 8х30.
- **Шурупы**: 4х25, 4х80.
- **Гвозди**: 1х16, 1,6х25.
- **Стяжки**: Minifix EC02/16/TE01, Minifix EC02/16/TE03, коническая BO04/GR06/TF04, Стяжка Blum.
- **Стяжки двойные**: Стяжка двойная.
- **Отверстия сквозные** и **глухие**: наборы диаметров.
- **Петли**: для угловой двери 135...225, для полунакладной, MINI для накладной стеклянной, для накладной двери. **Петли 180**.
- **Ручки-скобы**: Р366В хром. **Ручки-кнопки**: Р002 красная.
- **Схемы**: "ГВ задние стенки" (гвозди), "ПД симметричная" (полкодержатели), "Петли накладные", "СТ симметричная" (Minifix), "СТ+ШК симметричная" (Minifix + шкант 8х30). Схемы ссылаются на элементы из групп (Евровинт 6х50, Шкант 8х30 и т.д.).

Поля записи: `A, D, H, Y, d, h, l, x, y, z, A1, A2, D1-D3, H1-H3, X1-X3, Y1, d1, d2, h1, h2, x2, Name, Path, Size, Type, Class, Color, Group, Param, Table, Value, Length, Plane1, Plane2, Thick1, Thick2, Percent, Elements, Fastener, PrimStep, AdditStep, EndIndent, Fasteners, FurnCount, Furniture, HingeOffset, Plane1Holes, Plane2Holes, StartIndent, Additional furniture`. Отсюда видно, что крепёж описан **параметрически**: диаметры и глубины отверстий в двух плоскостях, шаг, отступы, количество, дополнительная фурнитура.

**Конфирмата в Fasteners.config нет**, эксцентрик представлен только как Minifix. Реальные 3D-модели конфирматов и эксцентриков лежат как `.f3d` в МДМ (раздел 2.1).

### 2.4 Текстуры (972 файла, 2 ГБ; 892 jpg + 60 jpeg + 12 exe-установщиков)

| Папка | jpg | Размер картинки | Каталог импорта | Импортировано в FDB |
|---|---|---|---|---|
| `Egger_Texture\EGGER` | 178 (F021..., H1180...) | 685x1475, ~2 МБ | `Egger.xml`: 2286 записей. ЛДСП 140 декоров x толщины 8/10/16/18/25/38 (2800x2070); PerfectSense 20; кромка АБС 19/22/23/28/35/43 x 0.4/0.8/2 мм; столешницы постформинг 55, филвуд 10, компакт 8 | **да** (174 текстуры) |
| `Rehau_Texture\Rehau\*` | 85 (Brilliant gloss/matt, Crystal Dekor/Gloss/matt, Terra Dekor/Uni, Velluto, Wave) | 709x709 ... 5291x3968 | `rehau.xml` (85) | **да** |
| `Skif_Texture\SKIF` | 130 | 3000x571 | `Skif.xml`: 2308 записей (столешницы матовые 1721, глянцевые 587) | нет |
| `AGT_Texture\TBM_AGT` | 110 | 1085x2354 (в имени реальный размер `(382x830mm)`) | `TBM_AGT.xml` (109, МДФ 2800x1220x18) | нет |
| `Дятьково ДОЗ` | 54 | 400x400 | нет | нет |
| `Русский Ламинат (ЭЗ ДСП)` | 61 jpeg | 275x275 | нет | нет |
| `СоюзБалтКомплект` | 333 (Двери 33, Профили МДФ 51, Стеновые панели 77, Гипласт 53, Софтформинг 24 + кромка 6, Фасад/Стол 89) | мелкие | нет | нет |
| `ЛДСП Центр` | 1 `shine_svetliy.jpg` | 938x1099 | вручную | **да** (материал "Гикори Шайн светлый", он стоит в модели "Закладная спальня") |
| exe в корне | akrilika, **alvic (507 МБ)**, chmf, dyatkovo-ldsp, Egger, Kronospan, Kronostar, rehau, rusian_laminat, skif, souzbaltkomplekt, tbm_agt | | | Alvic, Akrilika, ЧМФ, Kronospan, Kronostar **ещё не установлены** |

Другие текстуры: `Фурнитура GTV\...\Текстуры\GTV` (11 шт.) и jpg в папках AQ.

### 2.5 База материалов (FDB) [проверено сканом, без подключения]

- Таблицы и процедуры: `MATERIAL`, `GROUP_MATERIAL`, `TYPE_MATERIAL`, `PARAM_TEXTURE` (FK на материал, `NAME_TEXTURE`), `MATERIAL_ADVANCE`, `MATERIAL_CURRENCY`, `CLASS_MATERIAL`, `ATTEND_*` (сопутствующие материалы и операции), `OPERATION`, `COSTS`, `PR_MATERIAL_EXPORT`, `PR_MATERIAL_FIND_BY_NAME/ARTICLE`, `PR_GROUP_MAT_EDGE_SUB_GROUP`. Поля кромки и текстуры: `LABEL_EDGE, ISTAPE, PROFILE_EDGE, GROOVE_EDGE, HAS_TEXTURE, E_TEXTURE, E_STRETCH, E_MIRROR, E_ANGLE, E_COLOR, E_COLOR_USE`.
- Что внутри: учебные ДСП 8-28 мм (бук, вишня, серая), ХДФ Белый, ДВП ламинированная серая, "Кромка ПВХ 19/22/26/29", "Кромка меламин", Egger (ЛДСП + кромка АБС), Rehau, Гикори Шайн + кромка "Гикори Шайн светлый (синхропоры)" 0,8x19, Blum (34 упоминания), петли и направляющие учебной базы (FR302/402/602/6142, KA1730/5632, Quadro V6), заглушки к конфирматам, "Кромка 0,8/19 тон".
- В модели материал хранится одной строкой **"Наименование" + CR (`\u000d`) + "Артикул"**, например `Гикори Шайн светлый\rГикори Шайн свет 2800*2070*16 мм` **[проверено по `_claude\dump.json`]**. Разбирать через `ExtractMatName()` / `ExtractMatCode()`.
- `%APPDATA%\Bazis11\FurnMaterials.xml` хранит палитру последних выбранных материалов (ID из БД): площадные "Гикори Шайн светлый" 16, "ХДФ Белый" 3, "Белый матовый" 16; кромки "Кромка 0,8/19 тон", "Гикори Шайн светлый (синхропоры)". Там же настройки кромления: припуск 0.5, подрезка панели Y.
- `%APPDATA%\Bazis11\Materials.xml` содержит визуальные свойства материалов (144 шт.): цвет, отражение, прозрачность, `<Texture>` с **абсолютным** путём и VRay `MapDiffuse` для рендера.

### 2.6 Прочее
- `Библиотека дверей\Doors.bdl` (383 КБ), `Библиотека ящиков\Boxes.bbb` (196 КБ): штатные, параметрические.
- `Шаблоны бирки`, `Шаблоны отчетов`, `Templates`, `Blum`: пустые папки.
- `Модели`: Секретер, Секретер в блоках, Шкаф в блоках.

---

## 3. Что лежит в Downloads

### 3.1 `ТБМ Firmax` (как производитель поставляет библиотеку)
- `readme.txt` (cp1251), порядок установки:
  1. Скопировать папку `Фрагменты` в `Папка пользователя\Bazis<версия>\Фрагменты`.
  2. В панели "Файлы", раздел "Фрагменты", выбрать "Изменить раздел" и поставить фильтр `.f3d.fr3d.b3d.ldw.frw` или `*`.
  3. Импортировать номенклатуру: "База материалов", "Файл", "Импорт номенклатуры из XML", файл `TBM.xml`.
- `Фрагменты\`: 1091 fr3d + 435 f3d (Направляющие, Петли, Системы выдвижения). **Все 1526 файлов уже есть** в `Documents\Bazis11\Фрагменты` **[проверено сравнением путей]**.
- `TBM.xml` (UTF-8 BOM): 398 позиций `FRM....` в группах `Фурнитура/Петли/Петли Firmax/{Slide-On, Click-On, Clickline}...` и `Фурнитура/Системы выдвижных ящиков/{Роликовые, Slimline, Newline, Шариковые, Скрытого монтажа, Alpha}...`. Единицы `шт`/`компл.`, размеры 0, `<Texture/>` пуст. **В FDB не импортирован.**

Формат записи импорта (объединение полей из TBM.xml, Egger.xml и Skif.xml):
```xml
<Database><Materials><Material>
  <Article>1356302</Article><Name>F186 ST9 Бетон Чикаго светло-серый</Name>
  <Group_Name>Древовидная продукция/01. ЛДСП/2800x2070x16 мм</Group_Name>
  <Unit_Measure>кв.м.</Unit_Measure><Price>0</Price><Coef>1</Coef>
  <Length>2800</Length><Width>2070</Width><Thickness>16</Thickness>
  <Sign/><Overhang>0</Overhang><Color>8369910</Color>
  <Texture>egger/F186.jpg</Texture>   <!-- путь ОТНОСИТЕЛЬНО папки Текстуры -->
  <Class/><IsTape>Y</IsTape><Weight>0</Weight><Comment/><NoAvailable>N</NoAvailable>
  <Stretch>0</Stretch><Mirrored>0</Mirrored><Mirror>0</Mirror>
  <Transparent>0</Transparent><Shininess>0</Shininess><Brightness>0</Brightness>
  <DX>0</DX><DY>0</DY><OffsetX>1000</OffsetX><OffsetY>1000</OffsetY><Angle>0</Angle>
  <Coef_Exc_Cutting>1</Coef_Exc_Cutting><Round_Mode>0</Round_Mode>
  <Type_Group_Material>2</Type_Group_Material>   <!-- 2 листовой, 3 кромка (по Egger.xml) -->
</Material></Materials></Database>
```
Кромка Egger: `<Unit_Measure>п.м.</Unit_Measure><Length>0</Length><Width>19</Width><Thickness>.4</Thickness><Type_Group_Material>3</Type_Group_Material>`, текстура та же, что у декора.

Readme Egger добавляет два шага **[проверено]**: при импорте отметить "Проверять уникальность материала: по артикулу и наименованию"; после импорта задать группам тип (ПКМ по группе, "Установить группе тип материала"): "Древоплитная продукция" и "Столешницы" получают "Листовой и погонный", "Кромка" получает "Кромочный".

### 3.2 `База_всё в одном` (оглавления zip, без распаковки)
- **BLUM.zip** (837 МБ, 2577 файлов: 2520 fr3d, 53 f3d, 3 xml). Сверх установленного (906 файлов) в архиве **1669 файлов**:
  - `Antarion\TANDEMBOX` 888 (antaro BLUMOTION / TIP-ON, белый, серый, ОРИОН, чёрный, 16 и 18 мм; релинги 56, вставки стекло/алюминий 81, направляющие 26, стабилизаторы);
  - `Antarion\Петли` 336 (CLIP top, CLIP top BLUMOTION 29, без пружин, МИНИ, для стекла, для алюминиевых рамок, **угловые 94**, MODUL, ответные планки, составные части 123);
  - TANDEM 16 мм 78, TANDEM plus 16 мм 67, TANDEM F 17-19 мм 28, TANDEM plus F 27;
  - ORGA-LINE 40, Направляющие STANDART 21, SPACE STEP 20, Навески 15, SERVO-DRIVE 14, фиксатор полки TANDEM/MOVENTO 12, Стяжки 8;
  - `Крепеж и фурнитура Aventos top 11.11.2024`: HF top 69, HL top 32, HS top 8, аксессуары 4;
  - xml "Antarion База материалов экспорт".
- **ОбновБазаФурнитФрагмент.zip** (3.1 ГБ, 2441 файл) содержит `Обновленная База для Курса/...` и **полностью совпадает** с установленной папкой Фурнитура (отличается один desktop.ini). Этот архив **уже распакован** рядом, в папку `Downloads\База_всё в одном\Обновленная База для Курса\` (2440 файлов, 3.1 ГБ). Это дубль установленной Фурнитуры. В установленной версии есть больше: распакованная МДМ (1142 файла), Ручки, Штанги.
- **Текстуры.zip** (1.3 ГБ): те же 12 exe-установщиков текстур, что лежат в `Текстуры` (akrilika, alvic, chmf, dyatkovo-ldsp, Egger, Kronospan, Kronostar, rehau, rusian_laminat, skif, souzbaltkomplekt, tbm_agt). Нового нет.

---

## 4. Script API: фурнитура, крепёж, материалы, текстуры, кромки

Источники: `_claude\ref\BazisSoft-Scripts\node_modules\@types\bazis\index.d.ts` (официальный), `CHANGELOG.md`, `_claude\types.js`, штатные скрипты в `Bazis11\Scripts`, `_claude\Script.pdf`. PDF рендерится нечитаемо (шрифты с собственной кодировкой кириллицы), но латиница из текстовых потоков извлекается. Оглавление подтверждает тот же набор: `LoadModel, SaveModel, NewModel, NewFurniture, NewFragment, Revert, ArrangePositions, ReplaceFurniture, ChooseMaterial, OpenFurniture, ActiveMaterial`; `Panel.MaterialName/TextureOrientation/AddButt/AddPlastic`; `PanelPlastic.TextureOrientation`; `InFurniture.Mount/Mount1/MountScheme/MountBox/DatumModeFilter`. Функций, которых нет в d.ts, в PDF не нашлось.

### 4.1 Сигнатуры [проверено d.ts]

Фурнитура и фрагменты:
- `OpenFurniture(filename: string): InfFurniture` открывает `.f3d` для установки (в types.js подсказка `file.f3d`).
- `InfFurniture`:
  - `Mount(panel1, panel2, x, y, z): Object3` ставит на стык двух панелей, точка в глобальных координатах;
  - `Mount1(panel, x, y, z, angle): Object3` ставит на плоскость панели;
  - `MountScheme(panel1, panel2, FurniturePosition, BasisPoint: Vector): Object3` ставит схему крепежа;
  - `MountBox(Position, Size, axisZ, axisY): Object3` ставит секцию (фрагменты с `DatumMode.Box`);
  - `Make(Thickness1, Thickness2): Object3`;
  - `DatumMode`, `DatumModeFilter`;
  - `EncodeToString(): string`, `DecodeFromString(str)`, `Choose(): boolean` (Choose интерактивный).
- `Action.Properties.NewFurnitureValue(): InfFurniture`; `Properties.NewFurniture(caption): ScriptFurnitureProperty` (`.Value: InfFurniture`); `NewFurnitureInput(caption): InFurniture`.
- `Action.ReplaceFurniture(Old: string[], New: InfFurniture[], Fasteners: Object3[])` массово заменяет фурнитуру.
- `Action.NewFurniture()`, `Action.NewFragment()`, `Action.NewModel()`, `Action.LoadModel(file): boolean`, `Action.SaveModel(file)` (есть и глобальные версии этих функций).
- `Article: FurnArticle` (`Name, Code, FurnType, Author, Subject, Enterprise, Notes, OrderCode, OrderName, DatumMode`) хранит атрибуты создаваемой модели, фурнитуры или фрагмента. В заголовке AQ-петли вторая UTF-16 строка равна `Петля`, то есть `FurnType` задаётся строкой типа "Петля" **[проверено по файлу]**.
- `DatumMode { None, Face, FaceFace, FaceButt, FaceEdge, ParallelFaces, Box, Scheme }`; `FurniturePosition { Inside, Outside, Up, Down }`.
- `AddBlock(name): Block`, затем `Block.Load(file)`: `List3D.Load(file: string): boolean`, в описании "*.b3d, *.f3d". В примере `Шахматы\Игра в шахматы.js` так грузятся `.fr3d` **[проверено примером]**.
- `BeginBlock(name)` / `EndBlock()`, `BeginParametricBlock/EndParametricBlock`, `AddAssembly`, `AddDraftBlock`, `AddCopy`, `AddSymmetry`, `DeleteObject`.
- `Block.IsFastener(): boolean`; `Object3.FindConnectedFasteners(obj?)`; `Object3.FindFastenedObjects()`; `List3D.IsElastic()`, `List3D.ElasticResize(newSize: Vector): Vector`.
- Примитивы для собственной геометрии: `AddPanel(w,h)`, `AddFrontPanel(x1,y1,x2,y2,z)`, `AddHorizPanel(x1,z1,x2,z2,y)`, `AddVertPanel(z1,y1,z2,y2,x)`, `AddExtrusion(name)` (`Contour`, `Thickness` = длина, `MaterialName`), `AddTrajectory(name)` (`Contour2D`, `Trajectory2D`); `Contour2D.AddCircle/AddRectangle/AddRoundRect/AddArc/Load(file.frw)`; `Object3.Orient/OrientGCS/RotateGCS/TranslateGCS/Build()`.
- **Отверстий, присадки и "параметрического крепежа как объекта" в API нет** (grep по `Hole`/`Drill` в d.ts пуст). Созданная скриптом фурнитура получится без сверловки.

Параметрический крепёж:
- `NewParamFastenerDB(): ScriptParamFastenerDB` с методами `LoadFromFile(filename): string`, `AddFromFile(filename): string`, `SaveToFile(filename): string`. Методов добавить или изменить запись **нет**, возможны только загрузка, слияние и сохранение файла.
- Старые `OpenFurnitureScheme(s)`/`NewFurnitureScheme` **удалены** в Базис 10 (CHANGELOG). Пример `Изучение\...\Форма построения изделия.js` с `OpenFurnitureSchemes('Schemes.config')` устарел.

Материалы, текстуры, кромки:
- `Panel.MaterialName: string`, `Panel.MaterialWidth`, `Panel.Thickness`, `Panel.TextureOrientation: TextureOrientation`.
- `enum TextureOrientation { None, Horizontal, Vertical }`. В старых скриптах встречаются константы `ftoHorizontal`/`ftoVertical` (`Aventos HF\Установка Aventos HF.js`).
- `Extrusion.MaterialName`, `Trajectory.MaterialName`; `PanelPlastic { Material, Thickness, TextureOrientation }`; `Panel.AddPlastic(material, Front)`.
- `Panel.Butts: PanelButts { Add(): PanelButt, Count, Butts[] }` (+ `Clear()` в штатном скрипте); `PanelButt { ElemIndex, Sign, Material, Thickness, Width, ClipPanel, Overhung, Allowance, CutIndex, Profile }`.
- `Panel.AddButt(material: InMaterial | ScriptMaterialProperty, elemIndex): PanelButt`, `Panel.IsButtVisible(index, distance)`.
- `NewMaterialInput(caption): InMaterial { Name, Thickness, Width, SetActive(), Apply(obj) }`; `NewButtMaterialInput(caption): InButtMaterial { Name, Sign, Thickness, Width, ClipPanel, Overhung, Allowance }`; `Properties.NewMaterial/NewButt(caption)` (`ScriptMaterialProperty/ScriptButtProperty { Thickness, Width, SetActive() }`).
- `ActiveMaterial: FurnMaterial { Name, Thickness, Width, Make(name, thick) }` задаёт материал для следующих `Add*Panel`.
- `Action.ChooseMaterial(): string` открывает окно выбора из базы (интерактивно, в агенте отключено). `FormatMatName(s)`, `ExtractMatName(s)`, `ExtractMatCode(s)`.
- **Записать материал в базу материалов из скрипта нельзя.** Такого API нет.

### 4.2 Минимальные примеры (ES5, ASCII, кириллица через \u)

**(1) Что уже есть в открытой модели: материалы, кромки, фурнитура** (только чтение):
```js
var mats = {}, edges = {}, furn = {};
function isFast(o) { try { return o.List && ((typeof o.IsFastener === 'function') ? o.IsFastener() : !!o.IsFastener); } catch (e) { return false; } }
function walk(list) {
  var n = list.Count;
  for (var i = 0; i < n; i++) {
    var o = list.Objects ? list.Objects[i] : list[i];
    if (isFast(o)) { furn[o.Name] = (furn[o.Name] || 0) + 1; continue; }
    if (o.List) { walk(typeof o.AsList === 'function' ? o.AsList() : o.AsList); continue; }
    var p = o.AsPanel;
    if (!p) continue;
    var m = ExtractMatName(p.MaterialName) + ' | ' + ExtractMatCode(p.MaterialName) + ' | t=' + p.Thickness;
    mats[m] = (mats[m] || 0) + 1;
    for (var b = 0; b < p.Butts.Count; b++) {
      var bt = p.Butts.Butts[b];
      var k = bt.Material + ' | ' + bt.Thickness;
      edges[k] = (edges[k] || 0) + 1;
    }
  }
}
walk(Model);
log(JSON.stringify({ materials: mats, edges: edges, furniture: furn }, null, 1));
```

**(2) Назначить материал из базы, направление текстуры и кромку.** Формат строки материала "Имя\rАртикул" проверен по dump.json. Пример для Egger F186 16 мм из Egger.xml:
```js
// F186 ST9 Beton Chikago svetlo-seryj \r 1356302
var MAT = 'F186 ST9 \u0411\u0435\u0442\u043e\u043d \u0427\u0438\u043a\u0430\u0433\u043e \u0441\u0432\u0435\u0442\u043b\u043e-\u0441\u0435\u0440\u044b\u0439\r1356302';
var EDGE = 'F186 ST9 \u0411\u0435\u0442\u043e\u043d \u0427\u0438\u043a\u0430\u0433\u043e \u0441\u0432\u0435\u0442\u043b\u043e-\u0441\u0435\u0440\u044b\u0439\r1195879'; // 19x0.4
var VERT = (typeof TextureOrientation !== 'undefined') ? TextureOrientation.Vertical : ftoVertical;
var sel = Model.Selections;                       // or BZ.byRole('side_left') etc.
for (var i = 0; i < sel.length; i++) {
  var p = sel[i].AsPanel; if (!p) continue;
  Undo.Changing(sel[i]);
  p.MaterialName = MAT;
  p.TextureOrientation = VERT;                    // grain along the long side of a side wall
  for (var e = 0; e < p.Contour.Count; e++) {
    if (p.IsButtVisible(e, 5)) {
      var b = p.Butts.Add();                      // same as BZ.addButt; UI check advised on first use
      b.ElemIndex = e; b.Material = EDGE; b.Thickness = 0.4; b.Width = 19; b.ClipPanel = true;
    }
  }
  sel[i].Build();
}
```
Штатный вариант через элемент кромки **[предположение, что Name и Thickness можно задать программно; в d.ts это не readonly-свойства]**:
```js
var bm = NewButtMaterialInput('Edge'); bm.Name = EDGE; bm.Thickness = 0.4; bm.Width = 19; bm.ClipPanel = true;
p.AddButt(bm, 0);
```

**(3) Поставить готовую фурнитуру из библиотеки** [проверено по штатному `Scripts\Крепёж на полки.js`: `OpenFurniture('Полкодержатель.f3d')`, затем `Mount(Polka, Bok1, x, y, z)`]:
```js
var fs = require('fs'), path = require('path');
var ROOT = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430';
function findFile(root, re) {
  var st = [root];
  while (st.length) {
    var d = st.pop(), names;
    try { names = fs.readdirSync(d); } catch (e) { continue; }
    for (var i = 0; i < names.length; i++) {
      var full = path.join(d, names[i]), s;
      try { s = fs.statSync(full); } catch (e2) { continue; }
      if (s.isDirectory()) st.push(full); else if (re.test(names[i])) return full;
    }
  }
  return null;
}
var file = findFile(ROOT, /^KON 7,0 x 70 .*\.f3d$/i);    // confirmat 7x70 Marcopol (MDM)
var conf = OpenFurniture(file);
// shelf = horizontal panel, side = vertical panel; point near the joint, global coords
var x = side.GabMax.x + 1, y = shelf.GabMin.y + shelf.Thickness / 2, z = shelf.GabMin.z + 50;
conf.Mount(shelf, side, x, y, z);
```
Чтение `fs` в движке Node 8 проверено скилом, пути с кириллицей в Node поддерживаются. **[предположение]**: `OpenFurniture` принимает полный юникодный путь (в примере путь относительный).

**(4) Вставить фрагмент** (.fr3d, например направляющую или секцию ящика):
```js
var blk = AddBlock('Slide NL500');
blk.Load(fileFr3d);                                   // proven for .fr3d by the chess example
blk.TranslateGCS(NewVector(x, y, z));                 // or AssignTransform / OrientGCS
// section-type fragments (DatumMode.Box): OpenFurniture(fileFr3d).MountBox(pos, size, AxisZ, AxisY)  [assumption for .fr3d]
```

**(5) Схема крепежа или крепёж, выбранный один раз и сохранённый строкой** [API проверено, сценарий = предположение]:
```js
// once, interactively (user runs script from menu, not via agent):
var f = Action.Properties.NewFurnitureValue(); if (f.Choose()) system.writeTextFile('C:\\...\\scheme_st_shk.txt', f.EncodeToString());
// later, via agent:
var f2 = Action.Properties.NewFurnitureValue(); f2.DecodeFromString(system.readTextFile('C:\\...\\scheme_st_shk.txt'));
f2.MountScheme(sidePanel, topPanel, FurniturePosition.Inside, NewVector(x, y, z));
```

**(6) Массовая замена фурнитуры** (например евровинт на конфирмат): `Action.ReplaceFurniture(['<old name>'], [OpenFurniture(newFile)], fastenerObjects)` **[сигнатура проверена, поведение не проверено]**.

**(7) Слияние баз параметрического крепежа** [API проверено, семантика возвращаемой строки = предположение, вероятно текст ошибки или пусто]:
```js
var db = NewParamFastenerDB();
log(db.LoadFromFile('C:\\Users\\Jarvis\\Documents\\Bazis11\\\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430\\Fasteners.config'));
log(db.AddFromFile('C:\\...\\vendor_fasteners.config'));
log(db.SaveToFile('C:\\...\\_claude\\Fasteners_merged.config'));   // never overwrite the original without backup
```

---

### Добавлено 14.09.2026

- **МДМ "Наполнение для шкафов"** (октябрь 2025, 264 файла f3d/fr3d) распаковано в `Фрагменты\Наполнение МДМ\` (папки "Наполнение для шкафов", "Полкодержатели", "Стеллажные и гардеробные системы"; `MDM.xml` и `Ридми.txt` в `_claude\mdm_napolnenie\`, номенклатура в базу не импортирована). Там есть гладильная доска выдвижная складная МДМ IB1135 (304 x 485 x 90.5 сложенная, высота по локальной оси Z), корзины, штанги, пантографы. Источник: страница mdm-complect.ru/sapr (в WebFetch отдаёт капчу Яндекса, во встроенном браузере открылась), прямая ссылка `https://cdn.mdm-complect.ru/SAPR/Bazis/napolnenie_bazis_1025.zip`; другие библиотеки МДМ там же по разделам (стяжки, направляющие, петли, ящики, подъёмники).
- **ТБМ (Firmax) TBM_11_25.zip** (90 МБ, февраль 2026, 2249 файлов, имена в cp866) лежит в `Downloads\`, не распакован. Внутри "Фрагменты ТБМ" (ящики Firmax/DTC/Alphalux, наполнение купе FIRMAX ALFA/CORA/Alphalux Aiden, кухонное наполнение DANA/Smartline, петли) и "Фурнитура ТБМ" с `ТБМ.xml`. Гладильной доски Firmax FRM5812.430 там нет. Пакеты: `https://cdn.bazissoft.ru/web/files/furniture/tbm/TBM_11_25.zip`, `TBM_Firmax.zip`, `TBM_Firm.zip`, `TBM_TOPSTAY.zip`, `TBM_Gola.zip`, `TBM_Logica.zip`.
- **GTV** обновление v10.11 (05.2026): `https://gtv-rus.com.ru/images/bryly3d-ru/GTV_to_Bazis_v10_11_05_2026.rar` (установлена v4.02 08.2024), доски там нет.
- **mebellaboratory.ru** (категория "Наполнение для шкафов", ресурс 1881 "Выдвижная гладильная доска" f3d) требует аккаунт, скачать без входа нельзя.
- Оглавление zip с русскими именами читать с кодировкой 866: `[IO.Compression.ZipFile]::Open($path, 'Read', [Text.Encoding]::GetEncoding(866))`, иначе поиск по кириллице пуст.

## 5. Рецепты "как создать недостающее"

### (а) Новая текстура декора ЛДСП

1. **Картинка.** JPEG sRGB, качество 85-90, 0.3-2 МБ. Длинная сторона вдоль рисунка (волокна), желательно бесшовная.
   - Как у поставщиков: Egger 685x1475 (около 2 МБ), Skif 3000x571, AGT 1085x2354 при реальном размере 382x830 мм (он указан в имени файла), Rehau 709x709, Дятьково 400x400.
   - Разумный ориентир: примерно 1 px/мм по реальному фрагменту 700-1500 мм вдоль волокна **[предположение]**.
   - Имя файла лучше давать ASCII-кодом декора (`H1145.jpg`). Кириллица допустима: Skif `100Ш.jpg`, FDB хранит UTF-8 **[проверено]**.
2. **Куда класть.** `Documents\Bazis11\Текстуры\<Бренд>\<код>.jpg`. В XML импорта `<Texture>` указывается **относительно папки Текстуры** (`egger/F186.jpg`, `SKIF\37.jpg`, `Rehau\Brilliant Gloss\...jpg`) **[проверено]**.
   - Здесь Egger лежит на уровень глубже (`Egger_Texture\EGGER\F186.jpg`), а в базе записано `egger\F186.jpg`. При этом рендер-кэш `%APPDATA%\Bazis11\Materials.xml` ссылается на абсолютный путь `...\Egger_Texture\EGGER\H1204.jpg`, значит Базис файл находит.
   - Как именно Базис ищет (рекурсивно, по имени или через кэш), не проверено **[предположение]**. Надёжнее класть ровно по относительному пути из XML.
   - У "ЛДСП Центр" в FDB есть и относительный (`Текстуры\ЛДСП Центр\shine_svetliy.jpg`), и абсолютный путь **[проверено]**.
3. **Привязка к материалу.** Через запись в базе материалов: поле `Texture` в XML импорта (в DBF `TEXTURE`), в FDB таблица `PARAM_TEXTURE` / `NAME_TEXTURE`.
4. **Размер и повтор текстуры.** Во всех каталогах стоят `OffsetX=1000`, `OffsetY=1000`, `DX=0`, `DY=0`, `Angle=0`, `Stretch=0`, `Mirrored=0`; в DBF GTV так же `STEPX=1000`, `STEPY=1000`. По смыслу **`OffsetX/OffsetY` (STEPX/STEPY) = физический размер одного тайла текстуры в мм**, `Stretch=1` растягивает картинку на всю панель, `Angle` поворачивает, `Mirrored` включает зеркальный повтор **[предположение: подтвердить на одном тестовом материале, сравнив рендер панели 2000 мм при 1000 и при 500]**.
5. **Направление на детали.** `Panel.TextureOrientation = TextureOrientation.Vertical/Horizontal/None`, для пластика `PanelPlastic.TextureOrientation` **[проверено d.ts + примеры]**.
   - Какая ось контура считается "Horizontal", не проверено **[предположение: вдоль ContourWidth]**. Проверить на одной панели после запуска агента.
   - Для ЛДСП с рисунком: боковины и фасады обычно Vertical, полки, крыши и дно Horizontal (вдоль длинной стороны). Панели без рисунка: None.
6. **Без базы, только для визуализации.** `%APPDATA%\Bazis11\Materials.xml` содержит `<Material><Name>Имя\nАртикул</Name><Texture>абс.путь</Texture><VRay><MapDiffuse><Enabled>Y</Enabled><Path>...</Path>`. Это рабочий файл настроек Базиса, при работающей программе его перезапишут **[предположение]**. Править не рекомендуется, только читать, чтобы понять, какие текстуры реально используются.

### (б) Новый материал ЛДСП или кромки в базе материалов

Честно: **скриптом Базиса добавить материал в базу нельзя** (API нет). Прямая запись в FDB технически возможна: сервер Firebird 2.5 запущен, `isql.exe` есть. Но нужна учётная запись SYSDBA (вводить пароли Claude не должен). Схема со своими триггерами, генераторами (`GEN_TYPE_MATERIAL_ID`, `GEN_PAR_TEXTURE_ID`) и процедурами (`PR_MATERIAL_*`) не документирована, так что есть реальный риск испортить базу. **Не рекомендуется.**

Рабочий путь, тот же, что у производителей:
1. Claude генерирует файл импорта `Documents\Bazis11\_claude\import_<декор>.xml` (UTF-8 с BOM) по формату из раздела 3.1:
   - листовой ЛДСП: `Group_Name` вида `ЛДСП/<Бренд>/2800x2070x16 мм`, `Unit_Measure` = `кв.м.`, `Length/Width/Thickness`, `Texture`, `OffsetX/OffsetY`, `Type_Group_Material=2`;
   - кромка того же декора: `Group_Name` вида `Кромка/<Бренд>/19х0,4 мм`, `Unit_Measure` = `п.м.`, `Width=19`, `Thickness=.4`, `IsTape=Y`, `Type_Group_Material=3`, текстура та же;
   - артикулы уникальные.
2. Пользователь один раз делает: База материалов, Файл, Импорт номенклатуры из XML, "Проверять уникальность по артикулу и наименованию". Если группа новая: ПКМ по группе, "Установить группе тип материала" (листовой или кромочный).
3. Дальше скрипты используют строку материала так, как она хранится в базе: `Имя + '\r' + Артикул`, а при пустом артикуле просто `Имя` (так у "ХДФ Белый", проверено 14.09.2026). Проверить из скрипта, есть ли материал в базе, нельзя: инспектор Базиса из скрипта ничего не находит (см. `pitfalls.md` скила bazis-script). Надёжно только взять строку у панели, где материал уже стоит (`BZ.materials()`), или посмотреть в окне базы материалов.

Обходные варианты:
- **Черновик без базы**: `MaterialName` = любая строка. Панели и спецификация (`BZ.spec`) работают, но из скрипта это не заметно: инспектор такую строку не ловит (проверено 14.09.2026). Для раскроя, смет и текстуры материал в базе нужен **[предположение для раскроя]**.
- **Установить готовые каталоги**, которые уже лежат у пользователя (раздел 2.4): exe Alvic, Kronospan, Kronostar, ЧМФ, Akrilika (пользователь запускает установщик), плюс импорт `Skif.xml`, `TBM_AGT.xml`, `TBM.xml` (Firmax), BLUM Antarion xml, `mdm.dbf`, `GTV.dbf`. Картинки Skif и AGT уже на месте.
- Бэкап базы перед массовым импортом: `gbak -b` (делает пользователь или по его явному разрешению).

### (в) Новая фурнитура (петля, направляющая другого бренда)

Порядок выбора:
1. **Найти в библиотеке, включая архивы**: `find_library.ps1 -Type hinge -Brand hettich -IncludeArchives`. Если модель лежит в архиве, распаковку делает пользователь (или Claude по явному разрешению в новую папку, например `Фурнитура\Hettich\Sensys`). Архивы Hettich, Grass, Boyard, Samet, СЛОРОС закрывают почти любой бренд петель и направляющих.
2. **Скопировать ближайший аналог** (только как основу для модели по каталогу и с согласия пользователя: правило "фурнитура только реальная, одна единица это один объект", 14.09.2026). Файл `.f3d/.fr3d` копируется в `Фурнитура\_Custom\` (или `Фрагменты\_Custom\`) под новым именем.
   - Внутреннее имя (`Name` в UTF-16 заголовке `BZ85`, из него берётся спецификация) при этом **не меняется** **[проверено: имя хранится в файле]**.
   - Чтобы переименовать или переразмерить: открыть файл как документ и поправить `Article.Name/Code` (и геометрию), затем сохранить: `Action.LoadModel(file)`, правки, `Action.SaveModel(newFile)` **[предположение: LoadModel открывает f3d как документ фурнитуры; делать только с согласия пользователя, потому что меняется активный документ]**.
   - Для эластичных блоков: `List3D.ElasticResize(NewVector(...))` **[проверено d.ts]**.
   - Сверловка, отверстия и точки привязки у копии остаются от аналога. Это главный плюс способа.
3. **Построить из примитивов и сохранить** (только если модели производителя нет нигде, по точным размерам каталога и после согласия пользователя; результат один объект фурнитуры в `_Custom`, в само изделие болванки из панелей и профилей не ставить) **[API проверено; то, что NewFurniture + SaveModel(".f3d") даёт корректный файл фурнитуры, это предположение; глобального `NewFurniture` в 11.6 нет, только `Action.NewFurniture()`]**:
```js
// run only with user consent: switches the active document
Action.NewFurniture();
Article.Name = 'Hinge XYZ 110 overlay';   // Cyrillic via \u
Article.Code = 'XYZ-110';
Article.FurnType = '\u041f\u0435\u0442\u043b\u044f';   // "Petlya", same as AQ hinge header
Article.DatumMode = DatumMode.FaceFace;
var cup = AddExtrusion('cup');            // cup d35 x 11.5
cup.Contour.AddCircle(0, 0, 17.5); cup.Thickness = 11.5; cup.MaterialName = 'Steel'; cup.Build();
var arm = AddExtrusion('arm');            // arm 50x15, length 60
arm.Contour.AddRoundRect(-7.5, 0, 7.5, 12, 2); arm.Thickness = 60; arm.MaterialName = 'Steel';
arm.OrientGCS(AxisX, AxisY); arm.TranslateGCS(NewVector(0, 11.5, 0)); arm.Build();
Action.SaveModel('C:\\Users\\Jarvis\\Documents\\Bazis11\\\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430\\_Custom\\XYZ-110.f3d');
```
   Ограничение: **отверстий под чашку и планку не будет** (в API нет присадки). Для ЧПУ и присадки нужен аналог из пункта 2 или редактор фурнитуры в UI. Такие модели годятся для визуализации, спецификации и проверки коллизий.
   - Фрагмент (ящик в сборе, секция): собрать через `BeginBlock(...)` ... `EndBlock()`, затем `Action.NewFragment()` + `SaveModel('...fr3d')` **[предположение]**. Либо пользователь сохраняет выделенный блок как фрагмент из UI.
4. **Номенклатура.** Если нужна позиция в смете, добавить её в базу материалов через XML-импорт (как TBM.xml: `Group_Name` вида `Фурнитура/Петли/<Бренд>`, `Unit_Measure=шт`) **[проверено форматом]**.
5. Не забыть про фильтр панелей: `.fr3d` в Фурнитуре и `.f3d` в Фрагментах в UI не видны без фильтра `*` (раздел 0).

### (г) Новый крепёж (конфирмат 7x70, эксцентрик другого производителя)

1. **Сначала поиск.** Уже есть:
   - `МДМ\Фурнитура\02 Стяжки...\Конфирмат (стяжка-евровинт)\KON 7,0 x 70 IB ... Marcopol.f3d`, а также 5x40, 5x50, 6,4x50, 7x48 KBO, 7x50 IA/IB и заглушки к ним;
   - эксцентрики Permo `EC02ZL_16`, `EC03ZL_18`, `EC04ZL_25`, `EC18ZL_28-30`, `EC22ZL FORZA FIX` со штоками `TE01...TE13` и `PRONTO FIX`;
   - шканты 6x30, 8x30, 8x40, 8x50, уголки, футорки, межсекционные стяжки;
   - в архивах: Titus System 6 (СЛОРОС), стяжки Blum (BLUM.zip).
   Ставить через `OpenFurniture(file).Mount(p1, p2, x, y, z)` (пример 3) или массово через `ReplaceFurniture`.
2. **Параметрический крепёж (`Fasteners.config`).** Там только Minifix, конусная стяжка, Blum, евровинт 6х50, шкант 8х30, шурупы, гвозди, петли и 5 схем.
   - Добавить запись скриптом нельзя: у `NewParamFastenerDB` есть только Load, Add и Save.
   - Бинарный формат вручную не править: не документирован, UTF-16 внутри длинных сериализованных структур.
   - Новый параметрический крепёж (например "Конфирмат 7х70": D отверстия в пласти 7/10 мм, в торце 5 мм на глубину 60, отступ, шаг) создаёт пользователь в UI в настройках крепежа. Claude готовит точную таблицу параметров по полям из раздела 2.3 (`D1/H1` плоскость 1, `D2/H2` плоскость 2, `StartIndent/EndIndent`, `PrimStep/AdditStep`, `FurnCount`, `Plane1Holes/Plane2Holes`).
   - Слить config от производителя с текущим можно скриптом `AddFromFile` + `SaveToFile` в новый файл, подмену делать с бэкапом.
3. **3D-модель крепежа (f3d) другого производителя.** Скопировать ближайший аналог (например `KON 7,0 x 50` в `KON 7,0 x 70`) и переименовать или переразмерить, как в (в)-2. Сверловка останется от аналога, её длину скриптом не поменять **[проверено: нет API]**. Длину отверстия правит пользователь в редакторе фурнитуры.
4. **Схемы.** Готовые схемы (СТ симметричная, СТ+ШК симметричная, ПД симметричная, ГВ задние стенки, Петли накладные) ставятся через `InfFurniture.MountScheme` (пример 5). Получить `InfFurniture` схемы без UI можно только через заранее сохранённую строку `EncodeToString`.

После любой установки крепежа запускать `BZ.inspect()` (`FastIntersection`, `FastIncorrect`, `PanelNotFixed`). Крепёж не пересчитывается при сдвиге панелей (pitfalls.md).

---

## 6. Как найти фурнитуру или материал для проекта

### 6.1 `find_library.ps1` (PowerShell 5.1, только чтение, UTF-8 с BOM)

Путь: `C:\Users\Jarvis\.claude\skills\ldsp-furniture-design\scripts\find_library.ps1`. Скрипт входит в скил.

Параметры:
- `-Query "a","b"`: все термины должны совпасть. Регистр не важен, пробел в терминах означает "что угодно между".
- `-Type`: `hinge | slide | box | lift | handle | leg | shelfsupport | hanger | coupe | fastener | push | straightener | hook | rod | kitchen | profile | appliance` (набор синонимов RU/EN по пути файла).
- `-Brand`: подстрока пути (blum, firmax, gtv, aq, grade, hettich, мдм, permo...).
- `-NL 500`: число, окружённое не-цифрами (NL, L=, НД=, размер).
- `-Kind`: `any | furniture (.f3d) | fragment (.fr3d/.frw/.b3d) | texture | material (записи из XML-каталогов импорта) | archive`.
- `-IncludeArchives`: оглавления `.zip` (встроенно) и `.rar`/SFX-`.exe` (через `UnRAR.exe lb`) без распаковки.
- `-IncludeDownloads`: добавить копии из Downloads (там дубли установленного и zip-архивы).
- `-Meta`: читать внутреннее имя модели из заголовка BZ85 (медленнее).
- `-Inventory`: сводка по видам, брендам, типам и папкам текстур.
- `-Json`, `-Top N`.

Проверенные запуски:
```powershell
$s = 'C:\Users\Jarvis\.claude\skills\ldsp-furniture-design\scripts\find_library.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File $s -Type slide -NL 500 -Kind fragment      # LEGRABOX/MOVENTO/Firmax/GTV NL500
powershell -NoProfile -ExecutionPolicy Bypass -File $s -Type fastener -Query 'KON 7,0 x 70' -Meta # MDM confirmat 7x70 Marcopol
powershell -NoProfile -ExecutionPolicy Bypass -File $s -Kind material -Query F186               # Egger.xml records: article, thickness, texture
powershell -NoProfile -ExecutionPolicy Bypass -File $s -Kind archive -Query tandembox,450 -IncludeDownloads   # BLUM.zip contents
powershell -NoProfile -ExecutionPolicy Bypass -File $s -Inventory
```
Сводка `-Inventory` по установленному (без Downloads, проверено запуском):
- 1591 furniture (.f3d), 4727 fragment (.fr3d/.frw/.b3d), 977 текстур, 123 архива, 26 каталогов xml/dbf.
- По брендам: GTV 1728, Firmax 1453, МДМ 1137, BLUM 906, AQ 554, без бренда 531 (учебные опоры, ручки, кухмод).
- По тегам типа (один файл может нести несколько): box 2439, slide 1432, lift 857, handle 790, hinge 731, fastener 713, push 460, leg 354, shelfsupport 225, kitchen 219, straightener 164, profile 104, coupe 76.
- Поиск в архивах тоже проверен: `-Kind archive -Query sensys -Type hinge` нашёл 1458 записей в Hettich Sensys zip; поиск по Titus нашёл СЛОРОС zip.

### 6.2 Алгоритм для скила
1. Из задачи взять тип (петля, направляющая, ящик, подъёмник, ручка, опора, стяжка), бренд (если назван), ключевые размеры (NL = глубина корпуса минус 10-50 мм, угол петли, накладная или вкладная, толщина фасада 16/18) и нагрузку.
2. `find_library.ps1 -Type ... -Brand ... -NL ...`. Если пусто, то `-IncludeArchives` (Hettich, Grass, Boyard, Samet лежат в архивах). Если опять пусто, взять ближайший аналог другого бренда (раздел 5в).
3. Для материалов: `-Kind material -Query <код декора>` по XML-каталогам. Есть ли материал в самой базе, скриптом в Базисе не проверить: инспектор из скрипта ничего не находит (см. `pitfalls.md` скила bazis-script). Без агента: скан байтов FDB, UTF-8 поиск строки, как в этом исследовании; или пользователь смотрит в окне базы материалов.
4. Вернуть пользователю путь, вид (f3d или fr3d), внутреннее имя, способ установки (`Mount` / `AddBlock+Load` / `MountBox`). Если файл в архиве, попросить распаковать.

### 6.3 Поиск изнутри Базиса (через агента)
Функция `findFile(root, regex)` из примера 3 (раздел 4.2) на `fs.readdirSync`. Сканировать `Фурнитура` целиком из скрипта медленно (около 6 тыс. файлов плюс архивы), лучше звать `find_library.ps1` снаружи и передавать в команду готовый путь.

---

## 7. Что проверить, когда агент будет запущен (только чтение, без изменений модели)

Готовая команда лежит в `_claude\cmd_probe_library.js`: к списку ниже она добавляет значения `TextureOrientation` у панелей по ориентации, свойства существующей кромки (ширина ленты, подрезка, припуск) и `AnimType` блоков. Запуск: `bz.ps1 -File C:\Users\Jarvis\Documents\Bazis11\_claude\cmd_probe_library.js`. Ответы вписать сюда и снять пометки [предположение].

**Результаты пробы 14.09.2026** (Базис 11.6, apiVersion 1101, модель "Закладная спальня"):
- **Глобальные функции есть:** `OpenFurniture`, `NewParamFastenerDB`, `ExtractMatName`, `ExtractMatCode`, `FormatMatName`, `NewButtMaterialInput`, `NewMaterialInput`, `AddBlock`, `AddVertPanel`, `AddHorizPanel`, `AddFrontPanel`, `NewModelTransformer`, `DeleteObject`. Глобальных `NewFurniture` и `NewFragment` **нет**, работать через `Action.NewFurniture()` (по d.ts и `Action.NewFragment()`, не проверялся). У `Action` есть `ReplaceFurniture`, `Revert`, `Commit`, `SaveModel`, `LoadModel`.
- **Перечисления** доступны глобальными объектами: `TextureOrientation` {None 0, Horizontal 1, Vertical 2}; `AnimationType` {None 0, Custom 1, DoorLeft 2, DoorRight 3, DoorFlap 4, DoorLift 5, SDoorLeft 6, SDoorRight 7, Box 8, Support 9, Handle 10, Facade 11}; `DatumMode` {None 0, Face 1, FaceFace 2, FaceButt 3, FaceEdge 4, ParallelFaces 5, Box 6, Scheme 7}; `FurniturePosition` {Inside 0, Outside 1, Up 2, Down 3, Visible 4, InVisible 5} (двух последних в d.ts нет). Старые `ftoHorizontal` = 1 и `ftoVertical` = 2 тоже есть.
- **Ось текстуры** [проверено по данным модели, закрывает предположение из 5а-5]: у стоек и боковин `Vertical` идёт вдоль высоты (`ContourHeight`), у полок стоит `Horizontal` вдоль ширины (`ContourWidth`), у фронтальных деталей `Vertical` вдоль высоты, у ХДФ и части планок `None`. Итог: `Horizontal` вдоль `ContourWidth`, `Vertical` вдоль `ContourHeight`.
- **Свойства кромки** [проверено]: у кромки модели `Width` 19, `ClipPanel` true, `Overhung` 0, `Allowance` 0, `CutIndex` -1, `Sign` вида "2x19 <декор> (в тон)". Все свойства читаются скриптом.
- **Созданный в команде объект** до конца команды не виден в `Model.Count` и обходе модели, `UID` -1; после фиксации агентом виден с обычным UID. Удаление видно сразу.
- **Не проверено**, потому что меняет модель или активный документ: `OpenFurniture` на `.fr3d` и полном юникодном пути, `Action.NewFurniture()` + `SaveModel('x.f3d')`, смысл `OffsetX/OffsetY`, программная установка `InButtMaterial.Name`.

Исходный вариант пробы:
```js
var names = ['OpenFurniture','NewFurniture','NewFragment','NewParamFastenerDB','ExtractMatName','ExtractMatCode',
  'FormatMatName','NewButtMaterialInput','NewMaterialInput','AddBlock','NewModelTransformer','ReplaceFurniture'];
var r = {};
for (var i = 0; i < names.length; i++) { try { r[names[i]] = eval('typeof ' + names[i]); } catch (e) { r[names[i]] = 'err'; } }
r.TextureOrientation = (typeof TextureOrientation !== 'undefined') ? JSON.stringify(TextureOrientation) : 'undefined';
r.ftoVertical = (typeof ftoVertical !== 'undefined') ? ftoVertical : 'undefined';
r.ActionReplaceFurniture = typeof Action.ReplaceFurniture;
r.ActionNewFurniture = typeof Action.NewFurniture;
r.Article = (typeof Article !== 'undefined') ? { Name: Article.Name, FurnType: Article.FurnType, DatumMode: Article.DatumMode } : 'undefined';
r.DatumMode = (typeof DatumMode !== 'undefined') ? JSON.stringify(DatumMode) : 'undefined';
r.apiVersion = system.apiVersion;
log(JSON.stringify(r, null, 1));
```
Отдельно, с согласия пользователя, потому что меняются документ или модель:
1. Что делает `OpenFurniture` на `.fr3d` и на полном юникодном пути.
2. Какая ось соответствует `TextureOrientation.Horizontal`: ставится на тестовой панели, потом `Undo`.
3. Рождает ли `NewFurniture()` + `SaveModel('x.f3d')` валидную фурнитуру.
4. Смысл `OffsetX/OffsetY` в XML импорта: тестовый материал на 2 записи.
5. Можно ли задать `InButtMaterial.Name` программно для `AddButt`.

