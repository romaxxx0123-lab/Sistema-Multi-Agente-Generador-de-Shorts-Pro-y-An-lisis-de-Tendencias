from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg=b.new_page(viewport={'width':1280,'height':720})
    pg.route('**', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    pg.goto('file:///home/user/pixel-explorer/Vagabundo-de-Ellswyr.html')
    pg.wait_for_timeout(2300)
    pg.mouse.move(640,400); pg.mouse.down(); pg.mouse.up(); pg.wait_for_timeout(700)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    pg.keyboard.press('Enter'); pg.wait_for_timeout(1600)
    # worst case: everything visible at once
    pg.evaluate("""()=>{const s=window.__state;
      s.items.berry=12;s.items.wood=34;s.items.stone=23;s.items.mushroom=4;
      s.items.ore=9;s.items.crystal=2;s.items.relic=3;s.items.flower=15;
      s.pouch.campfire=2;s.pouch.bedroll=1;s.pouch.wall=6;s.pouch.poultice=2;s.pouch.ration=3;
      s.gear={torch:1,pack:1,boots:1,thermal:1,spear:1,charm:1};
      s.food=42;s.warm=38;s.heat=40;s.hp=55;}""")
    pg.wait_for_timeout(800)
    pg.screenshot(path='../assets_raw/A1_full.png')
    pg.keyboard.press('m'); pg.wait_for_timeout(600)
    pg.screenshot(path='../assets_raw/A2_map.png')
    b.close()
print('ok')
