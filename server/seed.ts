import { db } from "./db";
import { users, userRoles, categories, products, productImages } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Начинаем заполнение базы данных...");

  // Создание пользователей
  console.log("👥 Создаём пользователей...");
  
  const usersToCreate = [
    {
      email: "admin@ecomarket.ru",
      password: "admin123",
      firstName: "Администратор",
      lastName: "Системы",
      phone: "+79991234567",
      bonusBalance: 0,
      roles: ["admin", "customer"]
    },
    {
      email: "user1@example.com",
      password: "user123",
      firstName: "Иван",
      lastName: "Петров",
      phone: "+79001112233",
      bonusBalance: 500,
      roles: ["customer"]
    },
    {
      email: "user2@example.com", 
      password: "user123",
      firstName: "Мария",
      lastName: "Сидорова",
      phone: "+79002223344",
      bonusBalance: 750,
      roles: ["customer"]
    },
    {
      email: "user3@example.com",
      password: "user123",
      firstName: "Алексей",
      lastName: "Кузнецов",
      phone: "+79003334455",
      bonusBalance: 1000,
      roles: ["customer"]
    }
  ];

  for (const userData of usersToCreate) {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);

    if (existingUser.length === 0) {
      const passwordHash = await hashPassword(userData.password);
      
      const [newUser] = await db
        .insert(users)
        .values({
          email: userData.email,
          passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          phone: userData.phone,
          isVerified: true,
          bonusBalance: userData.bonusBalance,
        })
        .returning();

      for (const role of userData.roles) {
        await db.insert(userRoles).values({
          userId: newUser.id,
          role,
        });
      }

      console.log(`✓ Создан пользователь: ${userData.email}`);
    } else {
      console.log(`✓ Пользователь уже существует: ${userData.email}`);
    }
  }

  // Создание категорий
  const existingCategories = await db.select().from(categories).limit(1);
  
  if (existingCategories.length === 0) {
    console.log("📂 Создаём категории...");
    
    const categoryData = [
      { name: "Мёд и продукты пчеловодства", slug: "honey", description: "Натуральный мёд, прополис, пчелиная пыльца", sortOrder: 1 },
      { name: "Травяные сборы и чаи", slug: "herbs", description: "Лечебные травы и натуральные чаи", sortOrder: 2 },
      { name: "Органическая косметика", slug: "cosmetics", description: "Натуральная косметика и средства по уходу", sortOrder: 3 },
      { name: "Суперфуды", slug: "superfoods", description: "Спирулина, хлорелла, семена чиа и другие суперфуды", sortOrder: 4 },
      { name: "Масла и орехи", slug: "oils-nuts", description: "Органические масла и орехи", sortOrder: 5 },
    ];

    const createdCategories = await db.insert(categories).values(categoryData).returning();
    console.log(`✓ Создано ${createdCategories.length} категорий`);

    console.log("🛍️ Создаём 30 тестовых товаров...");
    
    const honeyCategory = createdCategories.find(c => c.slug === "honey")!;
    const herbsCategory = createdCategories.find(c => c.slug === "herbs")!;
    const cosmeticsCategory = createdCategories.find(c => c.slug === "cosmetics")!;
    const superfoodsCategory = createdCategories.find(c => c.slug === "superfoods")!;
    const oilsCategory = createdCategories.find(c => c.slug === "oils-nuts")!;

    const productData = [
      // Мёд и продукты пчеловодства (6 товаров)
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-001",
        name: "Мёд цветочный натуральный",
        description: "Натуральный цветочный мёд высшего качества, собранный в экологически чистых районах. Богат витаминами и минералами, укрепляет иммунитет.",
        composition: "100% натуральный цветочный мёд",
        storageConditions: "Хранить при температуре от +4°C до +20°C в тёмном месте",
        usageInstructions: "Употреблять по 1-2 чайные ложки в день",
        contraindications: "Индивидуальная непереносимость продуктов пчеловодства",
        weight: "500",
        shelfLifeDays: 730,
        stockQuantity: 50,
        price: "850",
        isNew: true,
      },
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-002",
        name: "Мёд гречишный тёмный",
        description: "Тёмный гречишный мёд с насыщенным вкусом и ароматом. Содержит повышенное количество железа и белка.",
        composition: "100% натуральный гречишный мёд",
        storageConditions: "Хранить при температуре от +4°C до +20°C в тёмном месте",
        usageInstructions: "Употреблять по 1-2 чайные ложки в день",
        contraindications: "Индивидуальная непереносимость продуктов пчеловодства",
        weight: "500",
        shelfLifeDays: 730,
        stockQuantity: 35,
        price: "950",
        discountPercentage: "10",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-003",
        name: "Мёд липовый",
        description: "Ароматный липовый мёд с нежным вкусом. Обладает противовоспалительными свойствами.",
        composition: "100% натуральный липовый мёд",
        storageConditions: "Хранить при температуре от +4°C до +20°C в тёмном месте",
        usageInstructions: "Употреблять по 1-2 чайные ложки в день",
        contraindications: "Индивидуальная непереносимость продуктов пчеловодства",
        weight: "500",
        shelfLifeDays: 730,
        stockQuantity: 42,
        price: "900",
      },
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-004",
        name: "Прополис натуральный",
        description: "Натуральный прополис - мощный природный антибиотик. Укрепляет иммунитет.",
        composition: "100% натуральный прополис",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Растворять небольшой кусочек в теплой воде",
        contraindications: "Аллергия на продукты пчеловодства",
        weight: "50",
        shelfLifeDays: 1095,
        stockQuantity: 28,
        price: "650",
        isNew: true,
      },
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-005",
        name: "Пчелиная пыльца",
        description: "Пчелиная пыльца - кладезь витаминов и микроэлементов. Повышает энергию и работоспособность.",
        composition: "100% натуральная пчелиная пыльца",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Принимать по 1 чайной ложке утром натощак",
        contraindications: "Аллергия на пыльцу",
        weight: "100",
        shelfLifeDays: 365,
        stockQuantity: 33,
        price: "720",
      },
      {
        categoryId: honeyCategory.id,
        sku: "HONEY-006",
        name: "Маточное молочко",
        description: "Маточное молочко - уникальный продукт пчеловодства с омолаживающим эффектом.",
        composition: "100% маточное молочко",
        storageConditions: "Хранить в холодильнике при температуре +2°C до +6°C",
        usageInstructions: "Принимать по 0,5 г под язык за 30 мин до еды",
        contraindications: "Аллергия, болезнь Аддисона",
        weight: "20",
        shelfLifeDays: 180,
        stockQuantity: 15,
        price: "1500",
        discountPercentage: "15",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isNew: true,
      },

      // Травяные сборы и чаи (6 товаров)
      {
        categoryId: herbsCategory.id,
        sku: "HERB-001",
        name: "Иван-чай ферментированный",
        description: "Традиционный русский чай из кипрея узколистного. Обладает успокаивающим действием, улучшает пищеварение.",
        composition: "Листья кипрея узколистного ферментированные - 100%",
        storageConditions: "Хранить в сухом прохладном месте в герметичной упаковке",
        usageInstructions: "Заваривать 1-2 чайные ложки на 200 мл кипятка, настаивать 5-7 минут",
        contraindications: "Индивидуальная непереносимость",
        weight: "100",
        shelfLifeDays: 365,
        stockQuantity: 100,
        price: "350",
        isNew: true,
      },
      {
        categoryId: herbsCategory.id,
        sku: "HERB-002",
        name: "Сбор трав \"Здоровый сон\"",
        description: "Натуральный травяной сбор для спокойного и крепкого сна. Содержит мяту, мелиссу, ромашку и лаванду.",
        composition: "Мята перечная, мелисса лекарственная, ромашка аптечная, лаванда",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Заваривать 1 пакетик на чашку кипятка за 30 минут до сна",
        contraindications: "Беременность, индивидуальная непереносимость",
        weight: "50",
        shelfLifeDays: 540,
        stockQuantity: 75,
        price: "280",
      },
      {
        categoryId: herbsCategory.id,
        sku: "HERB-003",
        name: "Сбор \"Иммунитет\"",
        description: "Укрепляющий иммунитет травяной сбор с эхинацеей, шиповником и имбирем.",
        composition: "Эхинацея, шиповник, имбирь, лимонник",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Заваривать 2 ч.л. на стакан кипятка, настаивать 10 минут",
        contraindications: "Аутоиммунные заболевания",
        weight: "75",
        shelfLifeDays: 540,
        stockQuantity: 55,
        price: "320",
        isNew: true,
      },
      {
        categoryId: herbsCategory.id,
        sku: "HERB-004",
        name: "Ромашка аптечная",
        description: "Цветки ромашки для приготовления успокаивающего чая и косметических процедур.",
        composition: "Цветки ромашки аптечной - 100%",
        storageConditions: "Хранить в сухом месте",
        usageInstructions: "Заваривать 1 ст.л. на стакан кипятка",
        contraindications: "Индивидуальная непереносимость",
        weight: "50",
        shelfLifeDays: 730,
        stockQuantity: 80,
        price: "180",
      },
      {
        categoryId: herbsCategory.id,
        sku: "HERB-005",
        name: "Мята перечная",
        description: "Листья мяты для освежающего чая и улучшения пищеварения.",
        composition: "Листья мяты перечной - 100%",
        storageConditions: "Хранить в сухом месте",
        usageInstructions: "Заваривать 1-2 ч.л. на чашку кипятка",
        contraindications: "Гипотония",
        weight: "50",
        shelfLifeDays: 730,
        stockQuantity: 90,
        price: "200",
      },
      {
        categoryId: herbsCategory.id,
        sku: "HERB-006",
        name: "Сбор \"Детокс\"",
        description: "Очищающий травяной сбор для выведения токсинов и улучшения обмена веществ.",
        composition: "Зелёный чай, крапива, одуванчик, береза",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Заваривать 1 ч.л. на стакан, пить утром натощак",
        contraindications: "Беременность, камни в почках",
        weight: "75",
        shelfLifeDays: 540,
        stockQuantity: 45,
        price: "340",
        discountPercentage: "10",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      },

      // Органическая косметика (6 товаров)
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-001",
        name: "Крем для лица с маслом ши",
        description: "Натуральный питательный крем для лица с маслом ши и витамином E.",
        composition: "Масло ши, витамин E, масло жожоба, экстракт алоэ",
        storageConditions: "Хранить при температуре от +5°C до +25°C",
        usageInstructions: "Наносить на очищенную кожу утром и вечером",
        contraindications: "Индивидуальная непереносимость компонентов",
        volume: "50",
        shelfLifeDays: 730,
        stockQuantity: 35,
        price: "890",
      },
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-002",
        name: "Мыло ручной работы с медом",
        description: "Натуральное мыло ручной работы с мёдом и овсянкой. Мягко очищает и питает кожу.",
        composition: "Масла оливковое, кокосовое, мёд, овсяные хлопья",
        storageConditions: "Хранить в сухом месте",
        usageInstructions: "Использовать для ежедневного умывания",
        contraindications: "Аллергия на мёд",
        weight: "100",
        shelfLifeDays: 365,
        stockQuantity: 60,
        price: "250",
        isNew: true,
      },
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-003",
        name: "Шампунь органический без сульфатов",
        description: "Мягкий органический шампунь без сульфатов и парабенов для всех типов волос.",
        composition: "Кокосульфат, экстракт крапивы, масло арганы, провитамин B5",
        storageConditions: "Хранить при комнатной температуре",
        usageInstructions: "Нанести на влажные волосы, вспенить, смыть",
        contraindications: "Индивидуальная непереносимость",
        volume: "250",
        shelfLifeDays: 730,
        stockQuantity: 48,
        price: "650",
      },
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-004",
        name: "Скраб для тела с кофе",
        description: "Натуральный скраб для тела с молотым кофе и кокосовым маслом. Отшелушивает и тонизирует.",
        composition: "Кофе молотый, масло кокоса, сахар тростниковый, эфирное масло апельсина",
        storageConditions: "Хранить в сухом месте",
        usageInstructions: "Массировать влажную кожу 3-5 минут, смыть",
        contraindications: "Повреждения кожи",
        weight: "200",
        shelfLifeDays: 180,
        stockQuantity: 40,
        price: "480",
        discountPercentage: "15",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      },
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-005",
        name: "Бальзам для губ с пчелиным воском",
        description: "Увлажняющий бальзам для губ с натуральным пчелиным воском и маслом какао.",
        composition: "Пчелиный воск, масло какао, масло ши, витамин E",
        storageConditions: "Хранить при температуре до +25°C",
        usageInstructions: "Наносить на губы по мере необходимости",
        contraindications: "Аллергия на продукты пчеловодства",
        weight: "15",
        shelfLifeDays: 730,
        stockQuantity: 70,
        price: "280",
      },
      {
        categoryId: cosmeticsCategory.id,
        sku: "COSM-006",
        name: "Зубная паста натуральная",
        description: "Натуральная зубная паста без фтора с экстрактом чайного дерева и мятой.",
        composition: "Карбонат кальция, экстракт чайного дерева, масло мяты, ксилит",
        storageConditions: "Хранить при комнатной температуре",
        usageInstructions: "Чистить зубы 2 раза в день",
        contraindications: "Индивидуальная непереносимость",
        volume: "75",
        shelfLifeDays: 730,
        stockQuantity: 55,
        price: "420",
        isNew: true,
      },

      // Суперфуды (6 товаров)
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-001",
        name: "Спирулина органическая в порошке",
        description: "100% натуральная спирулина - источник белка, витаминов и минералов. Повышает энергию и укрепляет иммунитет.",
        composition: "Спирулина платенсис (Spirulina platensis) - 100%",
        storageConditions: "Хранить в сухом прохладном месте, вдали от солнечных лучей",
        usageInstructions: "Принимать по 5-10 г (1-2 чайные ложки) в день с водой или соком",
        contraindications: "Беременность, лактация, аутоиммунные заболевания",
        weight: "200",
        shelfLifeDays: 730,
        stockQuantity: 40,
        price: "1250",
        discountPercentage: "15",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isNew: true,
      },
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-002",
        name: "Семена чиа органические",
        description: "Органические семена чиа - богатый источник Омега-3, клетчатки и антиоксидантов.",
        composition: "Семена чиа (Salvia hispanica) - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Добавлять 1-2 столовые ложки в день в йогурты, каши, смузи",
        contraindications: "Индивидуальная непереносимость",
        weight: "250",
        shelfLifeDays: 730,
        stockQuantity: 60,
        price: "450",
      },
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-003",
        name: "Ягоды годжи сушеные",
        description: "Сушеные ягоды годжи - природный источник антиоксидантов и витаминов.",
        composition: "Ягоды годжи сушеные - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Употреблять 10-30 г в день как снек или добавлять в блюда",
        contraindications: "Приём антикоагулянтов",
        weight: "200",
        shelfLifeDays: 365,
        stockQuantity: 52,
        price: "580",
      },
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-004",
        name: "Хлорелла в таблетках",
        description: "Хлорелла - мощный детоксикант и источник хлорофилла.",
        composition: "Хлорелла органическая - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Принимать по 3-6 таблеток в день во время еды",
        contraindications: "Беременность, лактация",
        weight: "100",
        shelfLifeDays: 730,
        stockQuantity: 35,
        price: "890",
        isNew: true,
      },
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-005",
        name: "Какао-бобы сырые",
        description: "Сырые какао-бобы - источник магния и натуральных антидепрессантов.",
        composition: "Какао-бобы сырые - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Употреблять как снек или измельчать в смузи",
        contraindications: "Индивидуальная непереносимость",
        weight: "200",
        shelfLifeDays: 730,
        stockQuantity: 44,
        price: "720",
      },
      {
        categoryId: superfoodsCategory.id,
        sku: "SUPER-006",
        name: "Киноа белая органическая",
        description: "Органическая киноа - полноценный растительный белок с всеми аминокислотами.",
        composition: "Киноа белая органическая - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Варить как крупу, добавлять в салаты и гарниры",
        contraindications: "Индивидуальная непереносимость",
        weight: "500",
        shelfLifeDays: 730,
        stockQuantity: 38,
        price: "650",
        discountPercentage: "10",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      },

      // Масла и орехи (6 товаров)
      {
        categoryId: oilsCategory.id,
        sku: "OIL-001",
        name: "Масло кокосовое virgin",
        description: "Нерафинированное кокосовое масло холодного отжима. Для приготовления и косметических целей.",
        composition: "Масло кокоса virgin cold pressed - 100%",
        storageConditions: "Хранить при комнатной температуре",
        usageInstructions: "Использовать для жарки, выпечки или в качестве косметического средства",
        contraindications: "Индивидуальная непереносимость",
        volume: "500",
        shelfLifeDays: 730,
        stockQuantity: 48,
        price: "850",
      },
      {
        categoryId: oilsCategory.id,
        sku: "OIL-002",
        name: "Масло льняное холодного отжима",
        description: "Льняное масло - рекордсмен по содержанию Омега-3 жирных кислот.",
        composition: "Масло льняное нерафинированное - 100%",
        storageConditions: "Хранить в холодильнике после вскрытия",
        usageInstructions: "Добавлять в салаты, каши (не нагревать)",
        contraindications: "Желчнокаменная болезнь",
        volume: "250",
        shelfLifeDays: 180,
        stockQuantity: 32,
        price: "380",
      },
      {
        categoryId: oilsCategory.id,
        sku: "NUT-001",
        name: "Миндаль сырой органический",
        description: "Сырой органический миндаль - источник витамина E и полезных жиров.",
        composition: "Миндаль сырой органический - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Употреблять как снек, добавлять в выпечку",
        contraindications: "Аллергия на орехи",
        weight: "200",
        shelfLifeDays: 365,
        stockQuantity: 55,
        price: "680",
      },
      {
        categoryId: oilsCategory.id,
        sku: "NUT-002",
        name: "Грецкие орехи очищенные",
        description: "Очищенные грецкие орехи - источник Омега-3 и антиоксидантов.",
        composition: "Ядра грецких орехов - 100%",
        storageConditions: "Хранить в холодильнике",
        usageInstructions: "Употреблять 5-7 орехов в день",
        contraindications: "Аллергия на орехи",
        weight: "250",
        shelfLifeDays: 180,
        stockQuantity: 42,
        price: "550",
        isNew: true,
      },
      {
        categoryId: oilsCategory.id,
        sku: "OIL-003",
        name: "Масло оливковое Extra Virgin",
        description: "Оливковое масло первого холодного отжима высшего качества.",
        composition: "Масло оливковое Extra Virgin - 100%",
        storageConditions: "Хранить в тёмном прохладном месте",
        usageInstructions: "Использовать для салатов и холодных блюд",
        contraindications: "Индивидуальная непереносимость",
        volume: "500",
        shelfLifeDays: 540,
        stockQuantity: 60,
        price: "780",
      },
      {
        categoryId: oilsCategory.id,
        sku: "NUT-003",
        name: "Кешью сырой",
        description: "Сырой кешью - нежный ореховый вкус и масса полезных веществ.",
        composition: "Кешью сырой - 100%",
        storageConditions: "Хранить в сухом прохладном месте",
        usageInstructions: "Употреблять как снек, добавлять в блюда",
        contraindications: "Аллергия на орехи",
        weight: "200",
        shelfLifeDays: 365,
        stockQuantity: 50,
        price: "720",
        discountPercentage: "12",
        discountStartDate: new Date(),
        discountEndDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
    ];

    const createdProducts = await db.insert(products).values(productData).returning();
    console.log(`✓ Создано ${createdProducts.length} товаров`);

    console.log("🖼️ Добавляем изображения для товаров...");
    const imageData = createdProducts.map(product => ({
      productId: product.id,
      url: "/placeholder-product.jpg",
      sortOrder: 0,
    }));

    await db.insert(productImages).values(imageData);
    console.log(`✓ Добавлено ${imageData.length} изображений`);
  } else {
    console.log("✓ Категории и товары уже существуют");
  }

  console.log("✅ База данных успешно заполнена!");
  console.log("\n📊 Итого создано:");
  console.log("   - Пользователей: 4 (admin + user1, user2, user3)");
  console.log("   - Категорий: 5");
  console.log("   - Товаров: 30");
  console.log("   - Изображений: 30");
}

seed()
  .catch((error) => {
    console.error("❌ Ошибка при заполнении базы данных:", error);
    process.exit(1);
  })
  .then(() => {
    console.log("👋 Готово!");
    process.exit(0);
  });
