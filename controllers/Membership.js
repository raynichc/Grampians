'use strict';

const _ = require('lodash');
const { sanitizeEntity } = require('strapi-utils');

const parse = require("date-fns/parse");
const add = require("date-fns/add");
const isFuture = require("date-fns/isFuture");

const sanitizeUser = user =>
  sanitizeEntity(user, {
    model: strapi.query('user', 'users-permissions').model,
  });

module.exports = {
  
  async get(ctx) {
    const memberships = await strapi.query("membership", "grampians").find({}, []);
    return memberships; 
  },

  /**
   * Process Membership Payments
   * @return {Object}
   */
  async pay(ctx) {
    const { membershipID, token } = ctx.request.body;

    //Get membership detailsfrom CMS
    const membership = await strapi.query("membership", "grampians").findOne({ id: membershipID });

    if (membership == null) {
      return ctx.badRequest("membership.notFound");
    }

    const pluginStore = strapi.store({
      environment: "", 
      type: 'plugin',
      name: 'grampians',
    });

    const stripeApiKey = await pluginStore.get({ key: "stripeApiKey" });

    const stripe = require("stripe")(stripeApiKey);

    if (!stripe) {
      return ctx.badRequest("stripe.invalidKey");
    }

    const charge = await stripe.charges.create({
      amount: membership.price * 100,
      currency: "aud",
      description: `Membership Payment`, //TODO: More details
      source: token
    }).catch(error => {
      //TODO: Proccess error?
      return error;
    });

    if (charge.status != "succeeded") {
      //TODO: Format error?
      return charge;
    }

    const user = ctx.state.user;
    const { id, currentMembershipLength } = user;

    //TODO: Lifetime membership override?

    const currentMembershipEndDate = add(parse(user.currentMembershipStartDate, "yyyy-MM-dd", new Date()), { days: currentMembershipLength });

    let updateData = {}

    //TODO: Clean this up.
    if (isFuture(currentMembershipEndDate)) {
      updateData = {
        currentMembershipLength: currentMembershipLength + membership.dayLength
      }
    } else {
      updateData = {
        currentMembershipStartDate: new Date(),
        currentMembershipLength: membership.dayLength
      }
    }

    const data = await strapi.plugins['users-permissions'].services.user.edit({ id }, updateData);

    ctx.send({ ok: true });
  },
};