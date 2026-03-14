const { getTodayActivities } = require('../controllers/activityController');
const Activity = require('../models/Activity');

jest.mock('../models/Activity');

describe('Activity Controller - getTodayActivities', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { _id: 'user123', companyId: 'company456' },
      query: {},
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  test('Single check-in: should return activity list with check-in', async () => {
    const mockActivities = [
      {
        _id: 'act1',
        type: 'check-in',
        description: 'Clock In – 09:00',
        timestamp: new Date('2026-03-14T09:00:00Z'),
        date: '2026-03-14',
      },
    ];

    Activity.countDocuments.mockResolvedValue(1);
    Activity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockActivities),
    });

    req.query.date = '2026-03-14';
    await getTodayActivities(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      activities: mockActivities,
    }));
  });

  test('Check-in + check-out: should return both activities', async () => {
    const mockActivities = [
      {
        _id: 'act2',
        type: 'check-out',
        description: 'Clock Out – 18:00',
        timestamp: new Date('2026-03-14T18:00:00Z'),
        date: '2026-03-14',
      },
      {
        _id: 'act1',
        type: 'check-in',
        description: 'Clock In – 09:00',
        timestamp: new Date('2026-03-14T09:00:00Z'),
        date: '2026-03-14',
      },
    ];

    Activity.countDocuments.mockResolvedValue(2);
    Activity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockActivities),
    });

    req.query.date = '2026-03-14';
    await getTodayActivities(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      activities: mockActivities,
    }));
  });

  test('Leave approval: should return leave-approved activity', async () => {
    const mockActivities = [
      {
        _id: 'act3',
        type: 'leave-approved',
        description: 'Leave Approved – 10:30',
        timestamp: new Date('2026-03-14T10:30:00Z'),
        date: '2026-03-14',
      },
    ];

    Activity.countDocuments.mockResolvedValue(1);
    Activity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(mockActivities),
    });

    req.query.date = '2026-03-14';
    await getTodayActivities(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      activities: mockActivities,
    }));
  });

  test('Empty state: should return empty list', async () => {
    Activity.countDocuments.mockResolvedValue(0);
    Activity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    req.query.date = '2026-03-14';
    await getTodayActivities(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      activities: [],
    }));
  });

  test('Time-zone edge cases: should filter by provided date string', async () => {
    // Client is in UTC+5:30 and it's 2026-03-15 early morning there, but 2026-03-14 in UTC
    const clientDate = '2026-03-15';
    
    Activity.countDocuments.mockResolvedValue(0);
    Activity.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    req.query.date = clientDate;
    await getTodayActivities(req, res);

    expect(Activity.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
      date: clientDate,
    }));
  });
});
