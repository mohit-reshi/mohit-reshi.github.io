// Starter foods, per 100 g. These are rounded, typical values from general food tables.
// They are approximate: brands, varieties and cooking change them. Every one can be edited and ticked as verified.
// Format: name | state | kcal | protein | carbs | fat | fibre | units ("unit=grams;..."; "ml=1.03" gives a density for ml)
import { slug } from './base.js';

const ROWS = `
Basmati rice|raw|349|7.5|77|0.6|1.3|katori=170;cup=185
Rice, white|raw|345|6.8|78|0.5|0.6|katori=170;cup=185
Rice, white|cooked|130|2.7|28|0.3|0.4|katori=150;cup=160
Rice, brown|raw|362|7.5|76|2.7|3.5|cup=190
Rice, brown|cooked|112|2.3|23.5|0.9|1.8|katori=150;cup=195
Wheat flour (atta)|raw|346|12|70|1.7|11|cup=120;tbsp=8
Maida (refined flour)|raw|350|11|74|1|2.7|cup=120;tbsp=8
Roti|cooked|300|9.5|56|3.7|4|roti=40;chapati=40
Phulka|cooked|265|9|54|1.5|4|phulka=30
Paratha|cooked|320|7|45|13|3|paratha=70
Naan|cooked|290|9|50|5.5|2.2|naan=90
Poha (flattened rice)|raw|350|6.6|77|1.2|1.0|cup=60
Semolina (rava)|raw|360|12.5|73|1|2.5|cup=165
Oats, rolled|raw|389|16.9|66|6.9|10.6|cup=80;tbsp=6
Besan (gram flour)|raw|387|22|58|6.7|10.8|cup=90;tbsp=7
Ragi flour|raw|336|7.3|72|1.3|11.5|cup=120
Bread, white|slice|265|9|49|3.2|2.7|slice=28
Bread, whole wheat|slice|247|13|41|3.4|7|slice=30
Cornflakes|raw|357|7.5|84|0.4|3|cup=28
Idli|cooked|140|4|28|0.4|1|idli=40
Dosa|cooked|170|3.9|29|3.7|1|dosa=90
Pasta|raw|371|13|75|1.5|3.2|cup=100
Pasta|cooked|158|5.8|31|0.9|1.8|cup=140
Poha|cooked|130|2.5|26|2|1|katori=130
Upma|cooked|130|3|20|4|1.5|katori=150
Toor dal|raw|335|22|58|1.7|15|katori=180;cup=190
Moong dal (split)|raw|348|24|59|1.2|16|katori=180;cup=190
Chana dal|raw|372|21|60|5.6|12|katori=180;cup=190
Masoor dal|raw|343|25|59|0.7|11|katori=180;cup=190
Urad dal|raw|347|24|59|1.4|18|katori=180;cup=190
Moong, whole green|raw|334|24|57|1.2|16|cup=200
Rajma (kidney beans)|raw|346|23|60|1.3|15|cup=185
Chickpeas (kabuli chana)|raw|378|20.5|63|6|12|cup=200
Black chana|raw|360|20|60|5|12|cup=200
Dal, plain|cooked|105|6.5|16|1.5|3|katori=150
Rajma|cooked|127|8.7|22.8|0.5|6.4|katori=150
Chickpeas|cooked|164|8.9|27|2.6|7.6|katori=150
Soya chunks|raw|345|52|33|0.5|13|cup=90
Tofu, firm|raw|144|17|3|8.7|2|slice=85
Sprouts, moong|raw|30|3|6|0.2|1.8|cup=104
Milk, full fat|liquid|67|3.2|4.7|4.1|0|ml=1.03;glass=250;cup=240
Milk, toned|liquid|58|3.1|4.7|3|0|ml=1.03;glass=250;cup=240
Milk, double toned|liquid|45|3.3|4.9|1.5|0|ml=1.03;glass=250;cup=240
Milk, skimmed|liquid|34|3.4|5|0.1|0|ml=1.03;glass=250;cup=240
Milk, buffalo|liquid|110|4.3|5|6.5|0|ml=1.03;glass=250;cup=240
Curd (dahi), full fat|raw|60|3.1|3|4|0|katori=150;cup=245;tbsp=15
Curd (dahi), low fat|raw|45|3.5|4.5|1.5|0|katori=150;cup=245
Greek yoghurt, plain|raw|97|9|4|5|0|cup=245;tbsp=15
Buttermilk (chaas)|liquid|40|3.3|4.8|1|0|ml=1.03;glass=250
Paneer|raw|265|18.3|1.2|20.8|0|cube=20;slice=25
Cheese, cheddar|raw|403|25|1.3|33|0|slice=20
Cheese, mozzarella|raw|280|28|3.1|17|0|slice=20
Butter|raw|717|0.9|0.1|81|0|tsp=5;tbsp=14
Ghee|raw|900|0|0|100|0|tsp=4.5;tbsp=14
Egg, whole|raw|143|12.6|0.7|9.5|0|egg=50
Egg, white|raw|52|11|0.7|0.2|0|white=33
Whey protein (typical)|raw|400|80|8|6|0|scoop=30
Chicken breast|raw|120|22.5|0|2.6|0|piece=170
Chicken thigh, skinless|raw|121|19.7|0|4.1|0|piece=110
Chicken, with skin|raw|215|18|0|15.5|0|piece=150
Mutton (goat)|raw|143|27|0|3|0|piece=40
Fish, rohu|raw|97|17|0|2|0|piece=100
Fish, salmon|raw|208|20|0|13|0|piece=150
Tuna, canned in water|raw|116|25.5|0|0.8|0|can=140
Prawns|raw|85|20|0.2|0.5|0|piece=12
Onion|raw|40|1.1|9.3|0.1|1.7|medium=110;small=70
Tomato|raw|18|0.9|3.9|0.2|1.2|medium=120;small=80
Potato|raw|77|2|17|0.1|2.2|medium=150;small=90
Potato|cooked|87|1.9|20|0.1|1.8|medium=130
Sweet potato|raw|86|1.6|20|0.1|3|medium=130
Carrot|raw|41|0.9|9.6|0.2|2.8|medium=70
Spinach|raw|23|2.9|3.6|0.4|2.2|cup=30;bunch=250
Cauliflower|raw|25|1.9|5|0.3|2|cup=100
Cabbage|raw|25|1.3|5.8|0.1|2.5|cup=90
Brinjal (eggplant)|raw|25|1|5.9|0.2|3|medium=300
Okra (bhindi)|raw|33|1.9|7.5|0.2|3.2|piece=10
Capsicum|raw|20|0.9|4.6|0.2|1.7|medium=120
Cucumber|raw|15|0.7|3.6|0.1|0.5|medium=200
Green peas|raw|81|5.4|14|0.4|5.7|cup=145
French beans|raw|31|1.8|7|0.2|2.7|cup=110
Bottle gourd (lauki)|raw|14|0.6|3.4|0.1|0.5|cup=116
Ridge gourd (turai)|raw|20|0.5|4.4|0.1|0.5|cup=100
Bitter gourd (karela)|raw|17|1|3.7|0.2|2.8|cup=93
Pumpkin|raw|26|1|6.5|0.1|0.5|cup=116
Beetroot|raw|43|1.6|9.6|0.2|2.8|medium=80
Radish|raw|16|0.7|3.4|0.1|1.6|medium=40
Garlic|raw|149|6.4|33|0.5|2.1|clove=3
Ginger|raw|80|1.8|18|0.8|2|tsp=2
Green chilli|raw|40|2|9|0.2|1.5|piece=5
Coriander leaves|raw|23|2.1|3.7|0.5|2.8|tbsp=4
Mushroom|raw|22|3.1|3.3|0.3|1|cup=70
Sweet corn kernels|raw|86|3.3|19|1.4|2|cup=145
Broccoli|raw|34|2.8|6.6|0.4|2.6|cup=90
Lettuce|raw|15|1.4|2.9|0.2|1.3|cup=36
Banana|raw|89|1.1|23|0.3|2.6|medium=100
Apple|raw|52|0.3|14|0.2|2.4|medium=150
Mango|raw|60|0.8|15|0.4|1.6|medium=200
Orange|raw|47|0.9|12|0.1|2.4|medium=130
Papaya|raw|43|0.5|11|0.3|1.7|cup=145
Watermelon|raw|30|0.6|7.6|0.2|0.4|cup=150
Grapes|raw|69|0.7|18|0.2|0.9|cup=150
Pomegranate|raw|83|1.7|19|1.2|4|cup=175
Guava|raw|68|2.6|14|1|5.4|medium=100
Pineapple|raw|50|0.5|13|0.1|1.4|cup=165
Dates, dried (khajur)|raw|282|2.5|75|0.4|8|piece=8
Raisins|raw|299|3.1|79|0.5|3.7|tbsp=9
Coconut, fresh|raw|354|3.3|15|33|9|tbsp=8
Coconut milk|liquid|197|2|2.8|21|0|ml=1;cup=240;tbsp=15
Coconut water|liquid|19|0.7|3.7|0.2|1.1|ml=1;glass=250
Avocado|raw|160|2|9|15|7|medium=150
Almonds|raw|579|21|22|50|12.5|piece=1.2;tbsp=9
Cashews|raw|553|18|30|44|3.3|piece=1.5;tbsp=9
Peanuts|raw|567|26|16|49|8.5|tbsp=9;cup=146
Walnuts|raw|654|15|14|65|6.7|piece=4
Pistachios|raw|560|20|28|45|10|tbsp=8
Chia seeds|raw|486|17|42|31|34|tbsp=12
Flax seeds|raw|534|18|29|42|27|tbsp=10
Sunflower seeds|raw|584|21|20|51|8.6|tbsp=9
Sesame seeds|raw|573|18|23|50|12|tbsp=9
Peanut butter|raw|588|25|20|50|6|tbsp=16
Oil (cooking)|liquid|900|0|0|100|0|ml=0.92;tsp=4.5;tbsp=13.5
Coconut oil|liquid|900|0|0|100|0|ml=0.92;tsp=4.5;tbsp=13.5
Sugar|raw|387|0|100|0|0|tsp=4;tbsp=12
Jaggery|raw|383|0.4|98|0.1|0|tsp=5;piece=20
Honey|raw|304|0.3|82|0|0|tsp=7;tbsp=21
Soy milk, unsweetened|liquid|33|2.9|1.7|1.6|0.4|ml=1.03;glass=250
Almond milk, unsweetened|liquid|15|0.6|0.3|1.2|0.2|ml=1.01;glass=250
Orange juice|liquid|45|0.7|10|0.2|0.2|ml=1.04;glass=250
Cola|liquid|42|0|10.6|0|0|ml=1.04;can=330
Tea, no sugar|liquid|1|0|0.2|0|0|ml=1;cup=150
Coffee, black|liquid|1|0.1|0|0|0|ml=1;cup=150
Hummus|raw|166|8|14|10|6|tbsp=15
Biscuit (Marie)|raw|430|7.5|76|10.5|2|piece=7
Chips (potato)|raw|536|7|53|35|4|packet=30
Chocolate, dark|raw|546|5|61|31|7|square=10
Ice cream|raw|207|3.5|24|11|0.7|scoop=70
Tomato ketchup|raw|112|1.7|26|0.1|0.3|tbsp=17
Mayonnaise|raw|680|1|0.6|75|0|tbsp=14
Tamarind pulp|raw|239|2.8|62.5|0.6|5.1|tbsp=17
Cream, fresh|raw|340|2|3|36|0|tbsp=15
`;

export function starterFoods() {
  return ROWS.trim().split('\n').map((line, rank) => {
    const [name, state, k, p, c, f, fi, units] = line.split('|');
    const food = { id: 's:' + slug(name + ' ' + state), name, state: state === 'liquid' || state === 'slice' ? '' : state, k: +k, p: +p, c: +c, f: +f, fi: +fi, units: [], source: 'starter', verified: false, rank };
    (units || '').split(';').filter(Boolean).forEach((u) => {
      const [un, v] = u.split('='); const n = +v;
      if (un === 'ml') food.density = n; else food.units.push({ name: un, g: n });
    });
    return food;
  });
}
export const STARTER_COUNT = ROWS.trim().split('\n').length;
