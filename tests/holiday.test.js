const {
  getHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
} = require('../controllers/holidayController');
const Holiday = require('../models/Holiday');

jest.mock('../models/Holiday');

describe('Holiday Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { _id: 'admin123', companyId: 'company456', role: 'admin' },
      query: {},
      body: {},
      params: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getHolidays', () => {
    test('should return all holidays for the company', async () => {
      const mockHolidays = [
        { name: 'New Year', date: '2026-01-01', companyId: 'company456' },
      ];

      Holiday.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockHolidays),
      });

      await getHolidays(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        holidays: mockHolidays,
      });
    });
  });

  describe('createHoliday', () => {
    test('should create a new holiday if date is unique', async () => {
      req.body = { name: 'Diwali', date: '2026-11-01' };
      Holiday.findOne.mockResolvedValue(null);
      Holiday.create.mockResolvedValue({ ...req.body, _id: 'h123' });

      await createHoliday(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        holiday: expect.objectContaining({ name: 'Diwali' }),
      }));
    });

    test('should return 400 if holiday already exists on date', async () => {
      req.body = { name: 'Duplicate', date: '2026-11-01' };
      Holiday.findOne.mockResolvedValue({ _id: 'existing' });

      await createHoliday(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'DUPLICATE_DATE',
      }));
    });
  });

  describe('updateHoliday', () => {
    test('should update holiday if it exists', async () => {
      const holiday = {
        _id: 'h123',
        name: 'Old Name',
        date: '2026-01-01',
        save: jest.fn().mockResolvedValue(true),
      };
      req.params.id = 'h123';
      req.body = { name: 'New Name' };

      Holiday.findOne.mockResolvedValue(holiday);
      Holiday.findOne.mockResolvedValueOnce(holiday); // For findOne (exists)
      Holiday.findOne.mockResolvedValueOnce(null); // For duplicate check (if date changes)

      await updateHoliday(req, res);

      expect(holiday.name).toBe('New Name');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
      }));
    });
  });

  describe('deleteHoliday', () => {
    test('should delete holiday', async () => {
      req.params.id = 'h123';
      Holiday.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await deleteHoliday(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Holiday deleted successfully.',
      });
    });

    test('should return 404 if holiday not found', async () => {
      req.params.id = 'h123';
      Holiday.deleteOne.mockResolvedValue({ deletedCount: 0 });

      await deleteHoliday(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
