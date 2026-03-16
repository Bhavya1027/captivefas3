const HOTELS = {
    'test-hotel': { hotelName: 'Test Atithe Hotel', faskey: 'c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646' },
};

export function getHotel(id) { return HOTELS[id] || null; }
