import os, random, shutil
from PIL import Image, ImageDraw
def mk(path, size, seed, fmt='WEBP'):
    random.seed(seed)
    im = Image.new('RGB', size, tuple(random.randint(0,255) for _ in range(3)))
    d = ImageDraw.Draw(im)
    for _ in range(7):
        x0,y0=random.randint(0,size[0]//2),random.randint(0,size[1]//2)
        d.rectangle([x0,y0,random.randint(x0+20,size[0]),random.randint(y0+20,size[1])], fill=tuple(random.randint(0,255) for _ in range(3)))
    os.makedirs(os.path.dirname(path), exist_ok=True); im.save(path, fmt, quality=90); return im
def thumb(path_full, path_thumb, size):
    im = Image.open(path_full); im.thumbnail(size); im.save(path_thumb, im.format, quality=85)
U='site/wp-content/uploads/'; C='cdn/uploads/'
# --- shop on CDN
for i in range(1,5):
    for k in ('main','hover'):
        mk(f'{C}c{i}-{k}.webp',(1000,1000),i*10+(k=='hover')); thumb(f'{C}c{i}-{k}.webp',f'{C}c{i}-{k}-300x300.webp',(300,300))
def prod(i):
    return (f'<li class="product type-product"><a class="woocommerce-LoopProduct-link" href="http://site.test:8124/shop/item-{i}/">'
            f'<img class="attachment-woocommerce_thumbnail" src="http://cdn.test:8125/uploads/c{i}-main-300x300.webp">'
            f'<img class="hover-image" src="http://cdn.test:8125/uploads/c{i}-hover-300x300.webp">'
            f'<img src="http://cdn.test:8125/uploads/icon.png" width="20" height="20">'
            f'<h2 class="woocommerce-loop-product__title">Item {i}</h2></a></li>')
os.makedirs('site/shop',exist_ok=True)
open('site/shop/index.html','w').write('<!doctype html><html><body class="woocommerce archive"><ul class="products">'+''.join(prod(i) for i in range(1,5))+'</ul></body></html>')
# --- blog archive, 2 pages
for i in range(1,8):
    mk(f'{U}b{i}.jpg',(1200,800),500+i,'JPEG'); thumb(f'{U}b{i}.jpg',f'{U}b{i}-300x200.jpg',(300,200))
shutil.copy(U+'b2.jpg',U+'b3.jpg'); shutil.copy(U+'b2-300x200.jpg',U+'b3-300x200.jpg')
def art(i):
    return (f'<article class="post type-post hentry"><a class="post-thumbnail" href="/blog/post-{i}/"><img class="wp-post-image" src="/wp-content/uploads/b{i}-300x200.jpg" '
            f'srcset="/wp-content/uploads/b{i}-300x200.jpg 300w, /wp-content/uploads/b{i}-768x512.jpg 768w"></a>'
            f'<h2 class="entry-title"><a href="/blog/post-{i}/">Post {i}</a></h2><img class="emoji" src="https://s.w.org/images/core/emoji/14/72x72/1f600.png"></article>')
for p,(rng,nxt) in {'':(range(1,5),'/blog/page/2/'),'page/2/':(range(5,8),None)}.items():
    os.makedirs('site/blog/'+p,exist_ok=True)
    n=f'<nav class="pagination"><a class="next page-numbers" href="{nxt}">Next</a></nav>' if nxt else ''
    open('site/blog/'+p+'index.html','w').write('<!doctype html><html><head><meta name="generator" content="WordPress 6.5"></head><body class="archive blog">'+''.join(art(i) for i in rng)+n+'</body></html>')
# --- gallery post with lazy image
for i in range(1,6):
    mk(f'{U}g{i}.jpg',(1200,800),900+i,'JPEG'); thumb(f'{U}g{i}.jpg',f'{U}g{i}-150x150.jpg',(150,150)); thumb(f'{U}g{i}.jpg',f'{U}g{i}-300x200.jpg',(300,200))
os.makedirs('site/gallery-post',exist_ok=True)
fig=''.join(f'<figure class="wp-block-image"><a href="/wp-content/uploads/g{i}.jpg"><img src="/wp-content/uploads/g{i}-150x150.jpg" width="150" height="150"></a></figure>' for i in range(1,5))
lazy='<img class="lazyload" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/wp-content/uploads/g5-300x200.jpg">'
open('site/gallery-post/index.html','w').write(f'<!doctype html><html><body class="single single-post"><article class="post"><div class="entry-content"><figure class="wp-block-gallery">{fig}</figure>{lazy}</div></article></body></html>')
Image.new('RGB',(20,20),(1,2,3)).save(C+'icon.png')
print('mock ok')
