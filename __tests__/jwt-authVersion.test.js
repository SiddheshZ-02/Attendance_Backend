process.env.JWT_SECRET = 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);

const jwt = require('jsonwebtoken');
const { generateToken } = require('../utils/helpers');

describe('generateToken', () => {
  it('embeds authVersion as av in access and refresh JWTs', () => {
    const id = '507f1f77bcf86cd799439011';
    const sid = 'session-test-1';
    const { accessToken, refreshToken } = generateToken(id, sid, 4);

    const access = jwt.verify(accessToken, process.env.JWT_SECRET);
    const refresh = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    expect(access.id).toBe(id);
    expect(access.sid).toBe(sid);
    expect(access.av).toBe(4);
    expect(refresh.av).toBe(4);
  });
});
