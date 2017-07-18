import axios from 'axios';

import { fetchUser, fetchUsers } from './users';
import { UserBuilder } from '../test_utils/user_builder';
import { rejectPromiseWith, resolvePromiseWith } from '../test_utils/promises';


// Mock out the bundle object from a dependency.
jest.mock('../core-helpers', () => ({
  bundle: {
    apiLocation: () => 'user/app/api/v1',
    kappSlug: () => 'mock-kapp',
  },
}));

describe('users api', () => {
  describe('#fetchUsers', () => {
    describe('when successful', () => {
      let response;
      let testUser;

      beforeEach(() => {
        response = {
          status: 200,
          data: {
            users: [],
          },
        };
        testUser = new UserBuilder().stub().withAttribute('Attribute', 'value').build();
        response.data.users.push(testUser);
        axios.get = resolvePromiseWith(response);
      });

      test('does not return errors', () => {
        expect.assertions(1);
        return fetchUsers().then(({ errors }) => {
          expect(errors).toBeUndefined();
        });
      });

      test('returns an array of users', () => {
        expect.assertions(2);
        return fetchUsers().then(({ users }) => {
          expect(users).toBeInstanceOf(Array);
          expect(users[0]).toMatchObject({
            username: testUser.username,
            displayName: testUser.displayName,
          });
        });
      });

      test('translates attributes', () => {
        expect.assertions(2);
        return fetchUsers({ xlatAttributes: true }).then(({ users }) => {
          expect(users[0].attributes).toBeDefined();
          expect(users[0].attributes).not.toBeInstanceOf(Array);
        });
      });
    });
  });

  describe('#fetchUser', () => {
    describe('when successful', () => {
      let response;
      let testUser;
      let username;

      beforeEach(() => {
        response = {
          status: 200,
          data: {
            user: {},
          },
        };
        testUser = new UserBuilder().stub().withAttribute('Attribute', 'value').build();
        username = testUser.username;
        response.data.user = testUser;
        axios.get = resolvePromiseWith(response);
      });

      test('does not return errors', () => {
        expect.assertions(1);
        return fetchUser({ username }).then(({ errors }) => {
          expect(errors).toBeUndefined();
        });
      });

      test('returns a user', () => {
        expect.assertions(1);
        return fetchUser({ username }).then(({ user }) => {
          expect(user).toMatchObject({
            username: testUser.username,
            displayName: testUser.displayName,
          });
        });
      });

      test('translates attributes', () => {
        expect.assertions(2);
        return fetchUser({ username }).then(({ user }) => {
          expect(user.attributes).toBeDefined();
          expect(user.attributes).not.toBeInstanceOf(Array);
        });
      });
    });

    describe('when unsuccessful', () => {
      let response;

      beforeEach(() => {
        response = {
          status: 500,
        };
        axios.get = rejectPromiseWith({ response });
      });

      test('throws an exception when no user slug is provided', () => {
        expect(() => { fetchUser({}); }).toThrow();
      });

      test('does return errors', () => {
        expect.assertions(1);
        return fetchUser({ username: 'fake' }).then(({ serverError }) => {
          expect(serverError).toBeDefined();
        });
      });
    });
  });
});