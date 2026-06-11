function getSizesForType(sizeType) {
  if (sizeType === '신발') {
    var list = [];
    for (var mm = 210; mm <= 280; mm += 5) list.push(mm + 'mm');
    return list;
  }
  if (sizeType === '바지') return ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  if (sizeType === '상의' || sizeType === '아우터') return ['90', '95', '100', '105', '110'];
  return ['FREE'];
}

function resolveSizeType(category, name) {
  var n = name || '';
  if (category === '잡화' && (n.indexOf('스니커즈') >= 0 || n.indexOf('신발') >= 0 || n.indexOf('스니커') >= 0)) return '신발';
  if (category === '하의') return '바지';
  if (category === '아우터') return '아우터';
  if (category === '상의') return '상의';
  return '기타';
}

function stockLabel(stock) {
  if (stock <= 0) return { text: '품절 (SOLD OUT)', className: 'soldout' };
  if (stock >= 10) return { text: '재고 여유 (10개 이상)', className: 'ok' };
  return { text: '품절 임박 (남은 수량: ' + stock + '개)', className: 'low' };
}

module.exports = { getSizesForType, resolveSizeType, stockLabel };
