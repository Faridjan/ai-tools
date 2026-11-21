# BAZIS 10/11 Script API (сгенерировано из официального bazis.d.ts)

Источник: https://github.com/BazisSoft/Scripts (node_modules/@types/bazis/index.d.ts). Движок скриптов: Node.js 8.x (ES2015+, require('fs'), require('path'), require('vm')). Установленный Базис 11.6 отдаёт system.apiVersion = 1101.

Формат: имя(параметры): тип метод, имя: тип свойство. Комментарий после тире.

## System

- `log(str: string)` - Вывести диагностическое сообщение (для отладки?)
- `include(filename: string)` - Подключить указанный файл
- `fileExists(filename: string): boolean` - Возвращает true, если файл существует [устарело: используйте fs.existsSync]
- `askFileName(extension: string): string` - Открыть диалог выбора файла
- `askFolder(caption?: string, defaultFolder?: string): string` - Открыть диалог выбора папки
- `getFileName(filename: string): string` - Получить имя файла без пути
- `getFileNameWithoutExtension(filename: string): string` - Получить имя файла без пути и расширения
- `askFileNameSave(ext: string): string` - Открыть диалог сохранения файла
- `writeTextFile(filename: string, content: string)` - Записать текст в файл [устарело: используйте fs.writeFileSync]
- `askWriteTextFile(extension: string, content: string)` - Записать текст в файл с запросом имени файла
- `readTextFile(filename: string): string` - Считать текст из файла
- `askReadTextFile(extension: string): string` - Считать текст из файла с запросом выбора файла
- `secureExec(str: string)` - Выполнить зашифрованный код
- `exec(str: string): boolean` - Выполнить внешнюю программу
- `sleep(ms: number)` - Задерживает выполнение программы на указанное время
- `apiVersion: number` - Текущая версия Bazis API
- `developerApiVersion: number`

## IDispatch

- `GetTypeInfo: string` - Информациях о методах и свойствах объекта

## Model3D (extends List3D)

- `GSize: Vector` - Размер модели
- `GMin: Vector` - Габарит модели
- `GMax: Vector` - Габарит модели
- `Selected: Object3` - Выделенный объект модели
- `SelectionCount: number` - Количество выделенных элементов
- `Selections: Array<Object3>` - Список выделенных элементов
- `Count: number` - Количество объектов в модели
- `Objects: Array<Object3>` - Список объектов модели
- `forEachPanel(callbackfn: (panel: Panel) => void): void` - Выполнить функцию для каждой панели
- `forEach(callbackfn: (obj: Object3) => void): void` - Выполнить функцию для каждого объекта модели
- `UnSelectAll(): void` - Снять выделение со всех объектов

## Action3D

- `Interactive: boolean` - Если false, то запрещены любые функции взаимодействия с пользователем
- `Continue()` - Продолжить вызывать прерывания по завершению основного тела скрипта, не завершая команды
- `Commit()` - Применить изменения в модели внесенные в скрипте
- `Revert()` - Отменить изменения в модели внесенные в скрипте
- `Finish()` - Завершить команду
- `Cancel()` - Отменить команду
- `AsyncExec(func: Function)` - Выполнить функцию, в которой доступны запросы Get*
- `MouseX: number` - Позиция курсора X
- `MouseY: number` - Позиция курсора Y
- `Pos3: Vector` - Текущая позиция маркера
- `ViewDir: Vector` - Нормаль к текущему виду
- `UpDir: Vector` - Вектор вверх текущего вида
- `RightDir: Vector` - Вектор вправо текущего вида
- `ShowPoints: boolean` - Разрешать подсвечивать точки
- `ShowEdges: boolean` - Разрешать подсвечивать ребра
- `Hint: string` - Установить строку подсказки
- `ErrorHint: string` - Установить сообщение об ошибке
- `BlinkHint: string` - Установить мигающую подсказку
- `BeginOrtho3(pos: Vector)` - Включить режим Орто относительно точки
- `EndOrtho3()` - Отключить режим Орто
- `CursorToClosestPoint()` - Сдвинуть курсор к ближайшей точке привязки
- `CursorToClosestLine()` - Сдвинуть курсор к ближайшей линии
- `CursorToMiddleOfLine()` - Сдвинуть курсор к ближайшей середине линии
- `Find3DPoint(): Vector` - Найти точку на модели в текущем положении курсора мыши
- `Find3DPointXZPlane(): Vector` - Найти точку на плоскости X0Z
- `Get3DObject(): Object3` - Найти объект под курсором мыши
- `OnClick: Function` - Обработчик щелчка мыши
- `OnMove: Function` - Обработчик щелчка мыши
- `OnStart: Function` - Обработчик начала работы скрипта. Вызывается после загрузки значений свойств
- `OnFinish: Function` - Обработчик завершения работы скрипта
- `RayTraceScene()` - Запустить тонирование изображения
- `OnRayTraceFinished: Function` - Обработчик завершения тонирования изображения
- `Properties: RootProperties` - Набор редактируемых свойств
- `LoadModel(filename: string): boolean` - Загрузить модель из файла
- `SaveModel(filename: string)` - Сохранить модель в файл
- `NewModel()` - Создать новую модель
- `NewFurniture()` - Создать новую фурнитуру
- `NewFragment()` - Создать новый фрагмент
- `ModelFilename: string` - Имя файла текущей модели
- `ArrangePositions(Mode: FurnPositionMode, Model: List3D): boolean` - Расстановка позиций
- `ReplaceFurniture(Old: string[], New: InfFurniture[], Fasteners: Object3[])` - Замена фурнитуры
- `ChooseMaterial(): string` - Вызов окна выбора материала из базы. Возвращает полное имя материала

## FurnArticle
Артикул модели

- `Name: string` - Имя модели
- `NameWithCode(): string`
- `Code: string`
- `FurnType: string`
- `Author: string`
- `Subject: string`
- `Enterprise: string`
- `Notes: string`
- `OrderCode: string` - Код заказа
- `OrderName: string` - Имя заказа
- `DatumMode: DatumMode` - Тип установки фурнитуры/фрагмента

## ScriptMenu

- `Name: string` - Имя свойства
- `OnChange: Function` - Обработчик изменения свойства и вложенных свойств
- `Count: number` - Количество вложенных свойств
- `Items: Array<ScriptProperty>` - Список вложенных свойств
- `Clear()` - Очистить вложенные свойства
- `Store: boolean` - Флаг, сохраняется ли свойство в файл
- `Save(filename: string)` - Сохранить введенные пользователем данные в файле xml
- `Load(filename: string): boolean` - Загрузить значения полей из файла xml
- `NewGroup(caption: string): ScriptGroupProperty` - Создать вложенную группу свойств
- `NewString(caption: string, value?: string): ScriptStringProperty` - Создать строковое свойство
- `NewBool(caption: string, value?: boolean): ScriptBooleanProperty` - Создать свойство вида Да/Нет
- `NewNumber(caption: string, value?: number): ScriptNumberProperty` - Создать числовое свойство
- `NewButton(caption: string): ScriptButtonProperty` - Создать кнопку

## PropertyLayout

- `Left: number` - Левая граница
- `Right: number` - Правая граница
- `Top: number` - Верхняя граница
- `Bottom: number` - Нижняя граница
- `Width: number` - Ширина свойства
- `Height: number` - Высота свойства

## ScriptProperty

- `Name: string` - Имя свойства
- `Owner: ScriptProperty` - Родительское свойство
- `NameEditable: boolean` - Разрешить редактирование имени (для создания таблиц)
- `Enabled: boolean` - Возможность выделение свойства пользователем
- `ChildrenEnabled: boolean` - Выделение вложенных свойств
- `Visible: boolean` - Видимость свойства в окне свойств
- `Expanded: boolean` - Развернуты ли вложенные свойства
- `OnChange: Function` - Обработчик изменения свойства и вложенных свойств
- `OnValueChange: Function` - Обработчик изменения свойства
- `OnActivate: Function` - Обработчик активации свойства или меню
- `OnDeactivate: Function` - Обработчик деактивации свойства или меню
- `BackColor: number` - Цвет фона
- `Tag: number` - Пользовательское число
- `Count: number` - Количество вложенных свойств
- `Items: Array<ScriptProperty>` - Список вложенных свойств
- `Clear()` - Очистить вложенные свойства
- `Store: boolean` - Флаг, сохраняется ли свойство в файл
- `Save(filename: string)` - Сохранить введенные пользователем данные в файле xml
- `Load(filename: string): boolean` - Загрузить значения полей из файла xml
- `OnValueValidate: Function` - Проверка корректности значения
- `ValueValid: boolean` - Флаг корректности введенного значения, выставляется пользовательским обработчиком
- `Validate(): boolean` - Проверить значение свойства и вложенных свойств
- `Layout: PropertyLayout` - Расположение свойства на форме (для форм)
- `SetLayout(L: number, T: number, W: number, H: number)` - Задать расположение свойства на форме
- `Align: AlignType` - Задать выравнивание компонента (для форм)
- `AlignWithMargins: boolean` - Выравнивать с отступами (для форм)
- `SetMargins(L: number, R: number, T: number, B: number)` - Отступы между компонентами (для форм)
- `Alignment: AlignmentType` - Выравнивание текста в надписи (для форм)
- `NewGroup(caption: string): ScriptGroupProperty` - Создать вложенную группу свойств
- `NewImage(caption: string, imagefile: string): ScriptGroupProperty` - Создать вложенную группу свойств c рисунком
- `NewString(caption: string): ScriptStringProperty` - Создать строковое свойство
- `NewBool(caption: string): ScriptBooleanProperty` - Создать свойство вида Да/Нет
- `NewNumber(caption: string): ScriptNumberProperty` - Создать числовое свойство
- `NewButton(caption: string): ScriptButtonProperty` - Создать кнопку
- `NewSelector(caption: string): ScriptSelectorProperty` - Создать свойство с кнопкой редактирования
- `NewCombo(caption: string, Item1?: string): ScriptComboProperty` - Создать свойство - выпадающий список
- `NewMaterial(caption: string): ScriptMaterialProperty` - Создать свойство типа материал
- `NewButt(caption: string): ScriptButtProperty` - Создать свойство типа материал
- `NewFurniture(caption: string): ScriptFurnitureProperty` - Создать свойство типа материал
- `NewColor(caption: string): ScriptColorProperty` - Создать свойство типа цвет
- `NewSeparator(): ScriptProperty` - Создать разделитель
- `NewLabel(caption: string): ScriptProperty` - Создать надпись
- `PopupMenu: ScriptMenu` - Всплывающее меню
- `DropDownMenu: ScriptMenu` - Выпадающее меню

## RootProperties (extends ScriptProperty)

- `NewFurnitureValue(): InfFurniture` - Создать объект с информацией о фурнитуре

## AlignmentType
Тип выравнивания текста на надписи

- `Left` - Выравнивание по левому краю
- `Right` - Выравнивание по правому краю
- `Center` - Выравнивание по центру

## AlignType
Типы выравнивания компонентов на форме

- `None` - Не выравнивается по форме
- `Top` - Выравнивается по верхнему краю
- `Bottom` - Выравнивается по нижнему краю
- `Left` - Выравнивается по левому краю
- `Right` - Выравнивается по правому краю
- `Client` - Выравнивается по всей площади родительского компонента

## WindowPosition
Позиция немодального окна

- `Default` - Стандартная позиция формы
- `Left` - Форма пристыковывается слева
- `Right` - Форма пристыковывается справа

## FurniturePosition
Позиция фурнитуры при установке крепежа по схеме

- `Inside` - Установка фурнитуры внутри стыка
- `Outside` - Установка фурнитуры снаружи стыка
- `Up` - Установка фурнитуры вверху стыка (только для стыков с горизонтальной панелью)
- `Down` - Установка фурнитуры внизу стыка (только для стыков с горизонтальной панелью)

## ErrorType
Тип ошибки анализа модели

- `ObjIntersection` - Пересечение объектов
- `FastIntersection` - Пересечение фурнитуры
- `FastIncorrect` - Неправильная установка фурнитуры
- `MatNotExists` - Материала нет в наличии
- `MatOutOfStock` - Материал отсутствует на складе
- `PanelTooLarge` - Панель невозможно разместить на плите
- `PlasticTooLarge` - Пластик невозможно разместить на панели
- `PanelNotFixed` - Панель не закреплена

## InspectorError
Параметры обнаруженной ошибки

- `ErrorType: ErrorType` - Тип ошибки
- `ErrorObjectsCount: number` - Количество объектов, относящихся к ошибке
- `ErrorObjects: Array<Object3>` - Список объектов, относящихся к ошибке
- `ErrorMessage: string` - Сообщение ошибки
- `ObjectsNames: string` - Имена объектов в ошибке

## FurnPositionMode
Режим расстановки позиций

- `All = 0` - Раставить позиции заново
- `New = 1` - Раставить позиции у новых объектов
- `Check = 2` - Проверить позиции

## InspectorOptions
Параметры анализа модели

- `ObjIntersectionAnalyze: boolean` - Проверка пересечения объектов
- `FastIntersectionAnalyze: boolean` - Проверка пересечения фурнитуры
- `FastIncorrectAnalyze: boolean` - Проверка корректности фурнитуры
- `PanelNotFixedAnalyze: boolean` - Проверка скрепления панелей
- `PanelTooLargeAnalyze: boolean` - Проверка размера панели на плите
- `PlasticTooLargeAnalyze: boolean` - Проверка размера пластика на панели
- `MatNotExistsAnalyze: boolean` - Проверка материала в наличии
- `MatOutOfStockAnalyze: boolean` - Проверка материала на складе

## DatumMode
Тип монтирования фурнитуры/фрагмента

- `None` - Отсутствует
- `Face` - На плоскость
- `FaceFace` - по двум непараллельным плоскостям
- `FaceButt` - по плоскости и середине торца панели
- `FaceEdge` - По плоскости и ребру
- `ParallelFaces` - на 2 параллельные плоскости
- `Box` - секция
- `Scheme` - Крепеж по схеме

## ModelInspector

- `Run(Model: List3D)` - Проверить модель
- `ErrorList: Array<InspectorError>` - Список ошибок
- `Options: InspectorOptions` - Опции анализа

## ScriptForm

- `Properties: ScriptProperty` - Набор редактируемых свойств
- `Show(WindowPos?: WindowPosition)` - Показать форму
- `ShowModal(): boolean` - Показать модальную форму
- `Caption: string` - Заголовок формы
- `Width: number` - Ширина формы
- `Height: number` - Высота формы
- `MinWidth: number` - Минимальная ширина формы
- `MinHeight: number` - Минимальная высота формы
- `Visible: boolean` - Видимость формы
- `Left: number` - Положение левого края формы
- `Top: number` - Положение верхнего края формы
- `OKButton: boolean` - Показывать кнопку "ОК" на форме
- `OKButtonCaption: string` - Текст кнопки "ОК"
- `CancelButton: boolean` - Показывать кнопку "Отмена" на форме
- `CancelButtonCaption: string` - Текст кнопки "Отмена"
- `OnClose: Function` - Обработчик закрытия формы
- `Close()` - Закрыть форму
- `OnShow: Function` - Обработчик открытия формы
- `Resizable: boolean` - Возможность изменять размеры формы
- `Dockable: boolean` - Возможность пристыковывать не модальную форму
- `OnOkButtonClick: Function` - Обработчик нажатия на кнопку OK
- `OnCancelButtonClick: Function` - Обработчик нажатия на кнопку Cancel

## ScriptParamFastenerDB

- `LoadFromFile(filename: string): string` - Загрузить базу из файла
- `AddFromFile(filename: string): string` - Добавить базу из файла
- `SaveToFile(filename: string): string` - Сохранить базу в файл

## ScriptGroupProperty (extends ScriptProperty)

- `Image: string` - Путь к изображению
- `MaxHeight: number` - Максимальная высота
- `Scrollable: boolean` - Добавление полосы прокрутки

## ScriptStringProperty (extends ScriptProperty)

- `Value: string` - Значение свойства

## ScriptBooleanProperty (extends ScriptProperty)

- `Value: boolean` - Значение свойства

## ScriptNumberProperty (extends ScriptProperty)

- `MinValue: number` - Минимальное значение свойства
- `MaxValue: number` - Максимальное значение свойства
- `Value: number` - Значение свойства
- `ValueStep: number` - Шаг изменения значения (при заданных минимальном и максимальном значениях)

## ScriptButtonProperty (extends ScriptProperty)

- `OnClick: Function` - Обработчик нажатия на кнопку

## ScriptSelectorProperty (extends ScriptProperty)

- `Value: string` - Значение свойства
- `OnClick: Function` - Обработчик нажатия на кнопку редактирования свойства

## ScriptComboProperty (extends ScriptProperty)

- `ItemIndex: number` - Индекс текущего значения в списке
- `AddItem(item: string)` - Добавить элемент в список
- `Value: string` - Текущее значение в списке

## ScriptMaterialProperty (extends ScriptProperty)

- `Thickness: number` - Толщина материала
- `Width: number` - Ширина материала
- `SetActive()` - Установить активным. Все последующие элементы будут построены из этого материала

## ScriptButtProperty (extends ScriptProperty)

- `Thickness: number` - Толщина кромки
- `Width: number` - Ширина ленты
- `SetActive()` - Установить активным. Все последующие элементы будут построены из этого материала

## ScriptFurnitureProperty (extends ScriptProperty)

- `Value: InfFurniture` - Значение свойства
- `ClearValue(): void` - Очистить значение

## ScriptColorProperty (extends ScriptProperty)

- `Value: number` - Значение свойства

## Undo3D

- `Changing(obj: Object3)` - Начать запись изменений объекта
- `RecursiveChanging(obj: Object3)` - Начать запись изменений объекта и его составляющих

## FurnMaterial

- `Name: string` - Наименование материала
- `Thickness: number` - Толщина материала
- `Width: number` - Ширина материала
- `Make(name: string, thick: number)` - Создать материал из наименования и толщины (ширины)

## Vector

- `x: number` - Координата X
- `y: number` - Координата Y
- `z: number` - Координата Z

## Point

- `x: number` - Координата Х
- `y: number` - Координата Y

## Edge3

- `First: Vector` - Начало ребра в ЛСК
- `Last: Vector` - Конец ребра в ЛСК
- `GFirst: Vector` - Начало ребра
- `GLast: Vector` - Конец ребра

## RayInfo

- `Position: Vector` - Положение луча
- `Direction: Vector` - Направление луча
- `Distance: number` - Рассттояние до обнаруженного пересечения (не превышает заданного перед проверкой пересечений)
- `FindFirstIntersection: boolean` - Прекратить поиск пересечений луча с объектами после нахождения первого пересечения
- `IntersectBackFaces: boolean` - Проверять пересечения с поверхностями, если луч входит изнутри
- `IntersectHiddenObjects: boolean` - Проверять пересечения с невидимыми объектами
- `Start()` - Обнулить информацию о пересечении с объектом
- `Intersected: boolean` - Флаг - найдено ли пересечение
- `InterPos: Vector` - Найденная точка пересечения
- `Object3D: Object3` - Объект, с которым найдено пересечение

## Object3 (extends Object)

- `Name: string` - Наименование
- `ArtPos: string` - Артикул
- `Owner: List3D` - Родитель объекта
- `Visible: boolean` - Видимость объекта
- `Selected: boolean` - Является ли объект выделенным
- `Color: number` - Цвет линий объекта
- `List: boolean` - Является ли объект структурным
- `AsList(): List3D` - Привести объект к структурному
- `AsPanel: Panel` - Привести объект к типу панели
- `Position: Vector` - Положение объекта
- `PositionX: number` - Координата x
- `PositionY: number` - Координата y
- `PositionZ: number` - Координата z
- `SetDefaultTransform()` - Установить нулевые положение и ориентацию объекта
- `Translate(dir: Vector)` - Сместить объект
- `Rotate(axis: Vector, angle: number)` - Повернуть вокруг заданной оси. **angle в ГРАДУСАХ** (проверено 14.09.2026 на `RotateGCS`: `Math.PI` дал поворот на 3°, разворот это `180`)
- `TranslateGCS(dir: Vector)` - Переместить объект относительно глобальной системы координат
- `RotateGCS(axis: Vector, angle: number)` - Повернуть объект относительно глобальной системы координат. **angle в ГРАДУСАХ**, поворот вокруг глобального начала координат, после него вернуть объект `BZ.move` по габариту деталей
- `RotateX(angle: number)` - Повернуть вокруг оси X (градусы)
- `RotateY(angle: number)` - Повернуть вокруг оси Y (градусы)
- `RotateZ(angle: number)` - Повернуть вокруг оси Z (градусы)
- `Orient(axisz: Vector, axisy: Vector)` - Развернуть объект вдоль осей
- `OrientGCS(axisz: Vector, axisy: Vector)` - Развернуть объект вдоль глобальных осей
- `ToObject(pos: Vector): Vector` - Преобразовать точку в ЛСК объекта
- `ToGlobal(pos: Vector): Vector` - Преобразовать точку из ЛСК объекта
- `NToObject(dir: Vector): Vector` - Преобразовать нормаль в ЛСК объекта
- `NToGlobal(dir: Vector): Vector` - Преобразовать нормаль из ЛСК объекта
- `GSize: Vector` - Локальные размеры объекта
- `GMin: Vector` - Габарит объекта в ЛСК
- `GMax: Vector` - Габарит объекта в ЛСК
- `GabMin: Vector` - Габарит объекта
- `GabMax: Vector` - Габарит объекта
- `FindConnectedFasteners(Obj?: Object3): Array<Object3>` - Получить список общего крепежа на двух панелях
- `FindFastenedObjects(): Array<Object3>` - Получить список объектов, соединяемых этим крепежом
- `UserPropCount: number` - Количество пользовательских свойств
- `UserProperty: Array<Object>` - Значения свойства по его имени или индексу
- `UserPropertyName: Array<string>` - Названия свойств
- `Build()` - Перестроить объект после изменения его свойств
- `IsOwner(obj: Object3): boolean` - Определить, является ли объект obj родителем объекта
- `AssignTransform(source: Object3)` - Назначить локальные позицию и поворот из другого объекта
- `readonly UID: number` - Идентификатор объекта
- `RayIntersect(ray: RayInfo)` - Проверка пересечения луча с объектом

## List3D (extends Object3)

- `Count: number` - Количество объектов в структуре
- `[i: number]: Object3` - Получить элемент по индексу
- `Objects: Array<Object3>` - Список объектов
- `Find(name: string): Object3` - Найти объект по имени
- `IsElastic(): boolean` - Являетсяли объект эластичным
- `ElasticResize(newSize: Vector): Vector` - Растянуть объект до требуемых размеров
- `Load(file: string): boolean` - Загрузить объекты из файлов *.b3d,*.f3d

## Panel (extends Object3)

- `Contour: Contour2D` - Контур панели
- `ContourWidth: number` - Ширина контура панели
- `ContourHeight: number` - Высота контура панели
- `Thickness: number` - Толщина панели
- `MaterialName: string` - Материал панели
- `MaterialWidth: number` - Ширина материала
- `TextureOrientation: TextureOrientation` - Ориентация текстуры
- `Butts: PanelButts` - Список кромок
- `Plastics: PanelPlastics` - Список пластиков
- `Cuts: PanelCuts` - Список пазов
- `IsButtVisible(index: number, distance: number): boolean` - Закрыта ли кромка другими панелями? Указывается индекс кромки и расстояние до панелей.
- `IsContourRectangle: boolean` - Является ли контур прямоугольным?
- `AddButt(material: InMaterial | ScriptMaterialProperty, elem): PanelButt` - Накатать кромку на элемент
- `AddPlastic(material: InMaterial | ScriptMaterialProperty, Front: boolean): PanelPlastic` - Наклеить пластик на панель
- `AddCut(name: string): PanelCut` - Создать новый паз

## Extrusion (extends Object3)

- `Contour: Contour2D` - Контур профиля
- `Thickness: number` - Длина профиля
- `MaterialName: string` - Материал
- `MaterialWidth: number` - Ширина материала
- `Clip(pos: Vector, normal: Vector)` - Отрезать часть профиля в точке pos перпендикулярно normal

## Trajectory (extends Object3)

- `Contour2D: Contour2D` - Контур
- `Trajectory2D: Contour2D` - Траектория
- `MaterialName: string` - Наименование материала
- `MaterialWidth: number` - Ширина материала

## AnimBlock (extends List3D)

- `AnimType: AnimationType` - Тип анимации
- `DoorAngle: number` - Угол открытия двери
- `DoorShift: number` - Смещение двери

## Block (extends AnimBlock)

- `IsFastener(): boolean` - Флаг составной фурнитуры

## Assembly (extends AnimBlock)


## Contour3D (extends Object3)

- `Contour: Contour2D` - Элементы вспомогательного контура

## Size3D (extends Object3)

- `MakeOnPoints(Pos1, Pos2, TopPos)` - Перестроить по точкам
- `Value: number` - Размер

## AnimationType
Типы анимации сборок и блоков

- `None` - Не учитывается в салоне
- `Custom` - Учитывается в салоне, не имеет анимации
- `DoorLeft` - Дверь левая
- `DoorRight` - Дверь правая
- `DoorFlap` - Дверь откидная
- `DoorLift` - Дверь подъемная
- `SDoorLeft` - Дверь купе левая
- `SDoorRight` - Дверь купе правая
- `Box` - Ящик
- `Support` - Опора
- `Handle` - Ручка
- `Facade` - Фасад

## TextureOrientation
Направление текстуры материала на панели

- `None` - Нет
- `Horizontal` - Горизонтально
- `Vertical` - Вертикально

## PanelButts

- `Add(): PanelButt` - Добавить кромку
- `Count: number` - Количество кромок
- `Butts: Array<PanelButt>` - Список кромок

## PanelButt

- `ElemIndex: number` - Индекс кромки
- `Sign: string` - Условное обозначение
- `Material: string` - Наименование материала
- `Thickness: number` - Толщина кромки
- `Width: number` - ширина
- `ClipPanel: boolean` - подрезать панель на толщину кромки
- `Overhung: number` - свес - насколько лента кромки должна быть длиннее торца детали
- `Allowance: number` - припуск - насколько прифрезеровать торец перед кромкованием
- `CutIndex: number` - номер отреза (для наклейки кромки на несколько торцев одним отрезом)
- `Profile: Contour2D` - профиль кромки

## PanelPlastics

- `Add(): PanelPlastic` - Добавить пластик
- `Count: number` - Количество пластика
- `Plastics: Array<PanelPlastic>` - Список

## PanelPlastic

- `Material: string` - Наименование материала
- `Thickness: number` - Толщина пластика
- `TextureOrientation: TextureOrientation` - Ориентация текстуры

## PanelCuts

- `Add(): PanelCut` - Добавить паз
- `Count: number` - Количество пазов
- `Cuts: Array<PanelCut>` - Список пазов

## PanelCut

- `Name: string` - Имя паза
- `Sign: string` - Условное обозначение
- `Trajectory: Contour2D` - Траектория паза
- `Contour: Contour2D` - Профиль паза

## ElementType
Тип 2D элемента

- `Unknown` - Неизвестный
- `Line` - Линия
- `Arc` - Дуга
- `Circle` - Окружность
- `List` - Список элементов
- `Ellipse` - Эллипс

## Elem2D
2D-элемент

- `ElType: ElementType` - Тип 2D элемента
- `IsLine(): boolean` - Является ли элемент линией
- `AsLine(): Line2D` - Получить элемент как линию
- `IsCircle(): boolean` - Является ли элемент окружностью
- `AsCircle(): Circle2D` - Получить элемент как окружность
- `IsEllipse(): boolean` - Является ли элемент эллипсом
- `AsEllipse(): Ellipse2D` - Получить элемент как эллипс
- `IsArc(): boolean` - Является ли элемент дугой
- `AsArc(): Arc2D` - Получить элемент как дугу
- `IsList(): boolean` - Является ли элемент списком элементов
- `AsList(): Contour2D` - Получить элемент как список элементов
- `ObjLength(): number` - Длина элемента

## Line2D (extends Elem2D)
2D линия

- `Pos1: Point` - Начало
- `Pos2: Point` - Конец

## Arc2D (extends Elem2D)
2D дуга

- `Pos1: Point` - Начало
- `Pos2: Point` - Конец
- `Center: Point` - Центр
- `ArcDir: boolean` - Направление True = против часовой стрелки False = по часовой стрелке

## Circle2D (extends Elem2D)
2D окружность

- `Center: Point` - Центр
- `CirRadius: number` - Радиус
- `Dir: boolean` - Направление True = против часовой стрелки False = по часовой стрелке

## Ellipse2D (extends Elem2D)
2D эллипс

- `Center: Point` - Центр
- `MajorRadius: number` - Большой радиус
- `MinorRadius: number` - Малый радиус
- `MajorAxisAngle: number` - Угол
- `Dir: boolean` - Направление True = против часовой стрелки False = по часовой стрелке

## Contour2D

- `Count: number` - Количество элементов контура
- `Objects: Elem2D[]` - Список элементов контура
- `[index: number]: Elem2D` - Элемент контура
- `Width: number` - Ширина контура
- `Height: number` - Высота контура
- `Min: Point` - Левый нижний угол охватывающего прямоугольника
- `Max: Point` - Правый верхний угол охватывающего прямоугольника
- `Clear()` - Очистить контур
- `Move(dx: number, dy: number)` - Сдвинуть все элементы
- `Rotate(x: number, y: number, angle: number)` - Повернуть вокруг точки
- `AddRectangle(x1: number, y1: number, x2: number, y2: number)` - Добавить прямоугольник
- `AddRoundRect(x1: number, y1: number, x2: number, y2: number, rad: number)` - Добавить прямоугольник со скурглёнными краями
- `AddLine(x1: number, y1: number, x2: number, y2: number): Object` - Добавить линию
- `AddCircle(xc: number, yc: number, rad: number): Object` - Добавить окружность
- `AddArc(p1: Point, p2: Point, centre: Point, orient: boolean): Object` - Добавить дугу по началу, концу и центру
- `AddArc3(p1: Point, p2: Point, p3: Point): Object` - Добавить дугу по 3 точкам
- `AddEquidistant(contour: Contour2D, offset: number, Side: boolean, Rounding: boolean, Pos?: Point)` - Добавить эквидистанту контура. Последние 2 параметра отвечают за направление и скругление
- `AddEquidistantRecursive(contour: Contour2D, offset: number, Side: boolean, Rounding: boolean)` - Добавить эквидистанту контура (включая вложенные контуры). Последние 2 параметра отвечают за направление и скругление
- `Subtraction(contour: Contour2D)` - Вычесть замкнутый контур
- `Addition(contour: Contour2D)` - Сложить с замкнутым контуром
- `RoundingEx(elem1, elem2, x: number, y: number, radius): Object` - Скругление элементов
- `FacetEx(elem1, elem2, l1: number, l2?: number): Object` - Фаска на 2 элементах
- `Rounding(x: number, y: number, radius: number): Object` - Скругление в указанной точке
- `Facet(x: number, y: number, l: number): Object` - Фаска в указанной точке
- `Find(x: number, y: number): Object` - Найти ближайший элемент по координатам
- `Fit(x1: number, y1: number, x2: number, y2: number)` - Вписать весь контур в заданные габариты
- `Elastic(x1: number, y1: number, x2: number, y2: number, dx: number, dy: number)` - Растянуть контур резиновой нитью
- `Symmetry(x1: number, y1: number, x2: number, y2: number, Copy: boolean)` - Отразить контур относительно линии
- `Load(file: string): boolean` - Загрузить контур из файла *.frw
- `IsPointInside(x: number, y: number): boolean` - Находится ли точка внутри контура?
- `IsInContour(contour: Contour2D): boolean` - Находится ли контур внутри другого?
- `IsClosedContour(): boolean` - Является ли контур замкнутым?
- `IsContourRectangle(): boolean` - Является ли контур прямоугольным?
- `OrderContours(closet: boolean): boolean` - Упорядочить элеметны контура в одном направлении

## Geometry2D

- `Intersect(elem1, elem2): Array<Point>` - Вычислить точки пересечения двухмерных элементов
- `Compare(elem1, elem2): boolean` - Сравнить элементы
- `Distance(elem1, elem2): number` - Найти кратчайшее расстояние между элементами
- `Area(contour: Contour2D): number` - Найти площадь контура

## VectorGeometry3D

- `VectorNormalize(v: Vector): Vector` - Нормализовать вектор
- `VectorAdd(v1: Vector, v2: Vector): Vector` - Сложение двух векторов. Эквивалентно v1 + v2
- `VectorSub(v1: Vector, v2: Vector): Vector` - Вычитание двух векторов. Эквивалентно v1 - v2
- `VectorMul(v1: Vector, a: number): Vector` - Умножение вектора на число
- `VectorDiv(v1: Vector, a: number): Vector` - Деление вектора на число
- `VectorDot(v1: Vector, v2: Vector): number` - Скалярное произведение векторов
- `VectorEmpty(v: Vector): boolean` - Является ли вектор пустым
- `VectorCross(v1: Vector, v2: Vector): Vector` - Векторное произведение векторов
- `VectorCopy(v: Vector): Vector` - Создать копию точки
- `VectorLength(v: Vector): number` - Вычислить длину вектора
- `VectorNegate(v: Vector): Vector` - Инвертировать вектор

## ScriptSimpleConnection
Информация о простом соединении двух объектов

- `Mount(Furn: InfFurniture | InFurniture, mountPoint: Vector): Object3` - Установить фурнитуру на стык двух панелей
- `InvertPositions()` - Поменять начальную и конечную точки стыка
- `ChangeSide()` - Изменить пласть установки (установить обратную сторону стыка)
- `Panel1: Panel` - Первая панель
- `Panel2: Panel` - Вторая панель
- `PointStart: Vector` - Начало стыка
- `PointEnd: Vector` - Конец стыка
- `Dir: Vector` - Направление длины стыка (нормализованный вектор от начала до конца стыка)
- `WidthDir: Vector` - Направление ширины стыка (Нормализованный вектор от текущей до противоположной стороны стыка)

## ScriptCommonConnection
Информация об общем соединении двух объектов

- `[i: number]: ScriptSimpleConnection` - Получить элемент по индексу
- `Items: Array<ScriptSimpleConnection>` - Получить элемент по индексу
- `Count: number` - Количество элементов
- `Panel1: Panel` - Первая панель, указанная при создании объекта
- `Panel2: Panel` - Вторая панель, указанная при создании объекта

## InControl
Элемент на динамической панели

- `id: number`
- `Enabled: boolean` - Разрешить изменение свойства
- `Visible: boolean` - Видимость свойства
- `Hint: string` - Подсказка
- `OnChange: Function` - Обработчик

## InButton (extends InControl)
Элемент "Кнопка" на динамической панели

- `NewSubMenu(caption: string): InButton` - Создать подменю
- `Combo: boolean`

## InFloat (extends InControl)
Элемент ввода числа с плавающей точкой на динамической панели

- `Value: number` - Значение
- `ReadOnly: boolean` - Только для чтения
- `Fixed: boolean`

## InNumber (extends InControl)
Элемент ввода целого числа на динамической панели

- `Value: number` - Значение
- `ReadOnly: boolean` - Только для чтения
- `Fixed: boolean`

## InMaterial (extends InControl)
Элемент выбора материала на динамической панели

- `Name: string` - Наименование материала
- `Thickness: number` - Толщина материала
- `Width: number` - Ширина материала
- `SetActive()` - Установить активным. Все последующие элементы будут построены из этого материала
- `Apply(obj: Object3)` - Применить материал к указанному объекту

## InButtMaterial (extends InControl)
Элемент выбора кромки на динамической панели

- `Name: string` - Наименование кромки
- `Sign: string` - Условное обозначение
- `Thickness: number` - Толщина кромки
- `Width: number` - Ширина кромки
- `ClipPanel: boolean` - подрезать панель на толщину кромки
- `Overhung: number` - свес - насколько лента кромки должна быть длиннее торца детали
- `Allowance: number` - припуск - насколько прифрезеровать торец перед кромкованием

## InFurniture (extends InControl)
Элемент выбора фурнитуры на динамической панели

- `Mount(panel1: Panel, panel2: Panel, x: number, y: number, z: number): Object3` - Установить крепеж между двух панелей
- `Mount1(panel: Panel, x: number, y: number, z: number, angle: number): Object3` - Установить крепеж на плоскость панели
- `MountScheme(panel1: Panel, panel2: Panel, FurniturePosition: FurniturePosition, BasisPoint: Vector): Object3` - Установить схему крепежа на стык панелей
- `MountBox(Position: Vector, Size: Vector, axisZ: Vector, axisY: Vector): Object3` - Установить секцию
- `DatumModeFilter: DatumMode` - Фильтр по типу монтирования фурнитуры/фрагмента
- `DatumMode: DatumMode` - Тип монтирования выбранной фурнитуры/фрагмента

## InfFurniture
Информация о фурнитуре

- `Mount(panel1: Panel, panel2: Panel, x: number, y: number, z: number): Object3` - Установить крепеж между двух панелей
- `Mount1(panel: Panel, x: number, y: number, z: number, angle: number): Object3` - Установить крепеж на плоскость панели
- `MountScheme(panel1: Panel, panel2: Panel, FurniturePosition: FurniturePosition, BasisPoint: Vector): Object3` - Установить схему крепежа на стык панелей
- `MountBox(Position: Vector, Size: Vector, axisZ: Vector, axisY: Vector): Object3` - Установить секцию
- `Make(Thickness1: number, Thickness2: number): Object3` - Создать объект фурнитуры
- `DatumModeFilter: DatumMode` - Фильтр по типу монтирования фурнитуры/фрагмента
- `DatumMode: DatumMode` - Тип монтирования выбранной фурнитуры/фрагмента
- `EncodeToString(): string` - Зашифровать параметры фурнитуры в строку
- `DecodeFromString(str: string)` - Восстановить параметры фурнитуры из строки
- `Choose(): boolean` - Открыть окно выбора фурнитуры (возвращает false, если выбор отменен)

## DoorsMaker

- `Silent: boolean`
- `ShowErrors: boolean`
- `Save(filename: string)` - Сохранить параметры установки дверей в файл
- `Load(filename: string): boolean` - Загрузить параметры установки дверей из файла
- `Setup(LeftObject: Panel | Edge3, RightObject: Panel | Edge3, TopObject: Panel | Edge3, BottomObject: Panel | Edge3)` - Установить двери в секцию (Объект - Panel или Edge)

## BoxesMaker

- `ShowErrors: boolean`
- `Save(filename: string)` - Сохранить параметры установки ящиков в файл
- `Load(filename: string): boolean` - Загрузить параметры установки ящиков из файла
- `Setup(LeftObject: Panel, RightObject: Panel, TopObject: Panel | Edge3, BottomObject: Panel | Edge3)` - Установить ящик в секцию. LeftObject, RightObject - панели. TopObject, BottomObject - Panel или Edge

## ImportExport

- `SVG: ImportExportSVG` - Импорт-экспорт в SVG

## ImportExportSVG

- `CurveQuality: number` - Качество аппроксимации кривых в линии [0-100]
- `GroupElems: boolean` - Объединять элементы в полигоны, полилинии и кривые
- `Save(filename: string, contour: Contour2D): boolean` - Сохранить контур
- `Load(filename: string, contour: Contour2D): boolean` - Загрузить контур

## ScItemTovar
Элемент товара

- `Article: string` - Артикул элемента товара
- `Name: string` - Имя элемента товара
- `Material: string` - Текущий материал
- `GroupMaterial: string` - Имя группы материалов на замену
- `TypeElement: string` - Имя типа элемента
- `ObjList: List3D` - Список объектов из модели входящих в состав элемента товара

## ScItemTovarList
Товар

- `Items: Array<ScItemTovar>` - Доступ к элементу товара по индексу
- `Count: number` - Количество элементов товара
- `TovarName: string` - Имя товара
- `TovarArticul: string` - Артикул товара
- `FindByName(name: string, CaseSensitive: boolean): ScItemTovar` - Найти элемент товара по имени
- `IsNotStandart: boolean` - Является ли объект нестандартным

## TSalonUtils
Доп. функции

- `PathAttachments: string` - Путь к папке с прикрепленными файлами
- `GetFullPathAttachment(fileName: string): string` - Получить полное имя прикрепленного файла

## Arguments (extends Object)

- `callee: Function`
- `length: number` - Количество аргументов

## Глобальные функции и переменные

- `NewVector(x: number, y: number, z: number): Vector` - Создать 3D точку по координатам
- `NewPoint(x: number, y: number): Point` - Создать 2D точку по координатам
- `NewContour(): Contour2D` - Создать плоский контур
- `NewRayInfo(): RayInfo` - Создать луч для проверки пересечения с объектами
- `NewCOMObject(CLSID: string): IDispatch` - Создать новый COM объект по его типу
- `NewForm(caption: string): ScriptForm` - Создать форму со свойствами
- `NewParamFastenerDB(): ScriptParamFastenerDB` - Создать базу параметрического крепежа
- `NewPanelsConnection(p1: Panel, p2: Panel): ScriptCommonConnection`
- `AxisX: Vector` - Нормаль X
- `AxisY: Vector` - Нормаль Y
- `AxisZ: Vector` - Нормаль Z
- `Axis_X: Vector` - Нормаль -X
- `Axis_Y: Vector` - Нормаль -Y
- `Axis_Z: Vector` - Нормаль -Z
- `system: System` - Системные функции
- `Model: Model3D` - Структура модели
- `geometry: Geometry2D` - Вспомогательные геометрические функции
- `vectorGeometry: VectorGeometry3D` - Вспомогательные функции для работы с векторами
- `Action: Action3D` - Активный скрипт
- `Article: FurnArticle` - Артикул модели
- `ActiveMaterial: FurnMaterial` - Текущий материал
- `Undo: Undo3D` - История модели
- `prompt(message: string): string` - Вывести окно ввода строки
- `alert(str: string)` - Вывести окно сообщения
- `confirm(message: string): boolean` - Показать окно подтверждения (Да/Нет)
- `OpenFurniture(filename: string): InfFurniture` - Открыть фурнитуру для установки на модель
- `SelectAll()` - Выделить всё
- `UnSelectAll()` - Снять выделение с модели
- `ViewAll()` - Показать всё
- `SetCamera(p3d: Vector)` - Установить текущий вид
- `GetPoint(hint: string): Vector` - Запрос точки
- `GetObject(hint: string): Object3` - Запрос объекта модели
- `GetPanel(hint: string): Panel` - Запрос панели
- `GetEdge(hint: string, Axis: Vector): Edge3` - Запрос выбора ребра, параллельного указанному вектору
- `AddPanel(width: number, height: number): Panel` - Создать панель указанных размеров
- `AddFrontPanel(x1: number, y1: number, x2: number, y2: number, z: number): Panel` - Создать фронтальную панель
- `AddHorizPanel(x1: number, z1: number, x2: number, z2: number, y: number): Panel` - Создать горизонтальную панель
- `AddVertPanel(z1: number, y1: number, z2: number, y2: number, x: number): Panel` - Создать вертикальную панель
- `AddExtrusion(name: string): Extrusion` - Создать профиль
- `AddTrajectory(name: string): Trajectory` - Создать тело по траектории
- `AddBlock(name: string): Block` - Создать мебельный блок
- `AddDraftBlock(name: string): Block` - Создать полуфабрикат
- `AddAssembly(name: string): Block` - Создать мебельную сборку
- `AddCopy(obj: Object3): Object3` - Создать копию объекта
- `AddSymmetry(obj: string, pos: Vector, normal: Vector): Object3` - Создать симметричную копию объекта
- `AddContour(): Contour3D` - Создать вспомогательный контур в пространстве
- `AddSize(pos1: Vector, pos2: Vector, toppos: Vector): Size3D` - Создать размер
- `DeleteNewObjects()` - Удалить объекты ранее созданные в скрипте
- `DeleteObject(obj: Object3)` - Удалить объект из модели
- `StartEditing(obj: Object3): Object3` - Функция начала редактирования объекта
- `BeginBlock(name: string): Block` - Начать создание блока. Все созданные далее объекты попадают внутрь блока
- `EndBlock()` - Закончить создание блока
- `BeginParametricBlock(name: string): Block` - Начать создание редактируемого блока
- `EndParametricBlock()` - Закончить создание редактируемого блока
- `ParametricBlock: Block` - Редактируемый блок. Переменная установлена, если скрипт запущен в режиме редактирования
- `NewButtonInput(caption: string): InButton` - Создать элемент управления - кнопку
- `NewFloatInput(caption: string): InFloat` - Создать элемент управления для ввода целого числа
- `NewNumberInput(caption: string): InNumber` - Создать элемент управления для ввода числа
- `NewMaterialInput(caption: string): InMaterial` - Создать элемент управления для выбора материала
- `NewButtMaterialInput(caption: string): InButtMaterial` - Создать элемент управления для выбора кромочного материала
- `NewFurnitureInput(caption: string): InFurniture` - Создать элемент управления для выбора фурнитуры
- `NewModelInspector(): ModelInspector` - Создать элемент управления для анализа модели
- `NewDoorsMaker(caption: string): DoorsMaker` - Создать мастер установки дверей
- `NewBoxesMaker(caption: string): BoxesMaker` - Создать мастер установки ящиков
- `NewImportExport(): ImportExport` - Создать объект для импорта-экспорта
- `FormatMatName(matName: string): string` - Форматировать имя материала
- `OrientCamera(dir: Vector)` - Повернуть камеру
- `ExtractMatName(material: string): string` - Извлечь имя материала.
- `ExtractMatCode(material: string): string` - Извлечь код (артикул) материала.
- `LoadModel(filename: string): boolean` - Загрузить модель из файла
- `SaveModel(filename: string)` - Сохранить модель в файл
- `NewModel()` - Создать новую модель
- `NewFurniture()` - Создать новую фурнитуру
- `NewFragment()` - Создать новый фрагмент
- `ModelFilename: string` - Имя файла текущей модели
- `TovarItems: ScItemTovarList` - Список элементов товара. Только для Салона
- `SalonUtils: TSalonUtils` - Вспомогательные функции для работы с Салоном

## Есть в примерах, но нет в d.ts (проверять перед использованием)

- `Undo.BeginOper(name)` / `Undo.EndAndUndoOper()` - отменяемый блок операций (experimental)
- `NewModelTransformer()` - пересчёт модели при смене толщины панелей (experimental.d.ts из vscode-bazis-debug)
- `NewValueEditor(v)`, `Action.OnDraw`, `Action.OnValueChange`, `Action.ActionValueEditor`, `Model.DS.ToScreen/MillimetersInPixel` - экранные редакторы значений
- `Model.Build()` - перестроить всю модель после массовых правок
- `OpenFurnitureSchemes` / `FurnitureScheme` - УДАЛЕНЫ в Базис 10, схемы ставятся через `InfFurniture.MountScheme`
- В Базис 8 types.js `AsList` и `IsFastener` были свойствами, в d.ts это методы. `BZ.list(o)` и `BZ.isFastener(o)` обрабатывают оба варианта
