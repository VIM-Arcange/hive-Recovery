const RECOVERY_ACCOUNT = "hive.recovery"
const RECOVERY_EMAIL = "recovery@hivechain.app"
const API_NODE = "https://api.hive.blog"

const hiveClient = new dhive.Client(API_NODE)

// UI elements
const uiModal = document.getElementById("modal")
const uiModalSaved = document.getElementById("modal-saved")
const uiAccountCheck = document.getElementById("account-check")
const uiChangeForm = document.getElementById("change-form")
const uiChangeTitle = document.getElementById("change-title")
const uiChangeDone = document.getElementById("change-done")
const uiChangeSaved = document.getElementById("change-saved")
const uiRequestForm = document.getElementById("request-form")
const uiRequestTitle = document.getElementById("request-title")
const uiRequestDone = document.getElementById("request-done")
const btnChange = document.getElementById("btn-change")
const btnChangeDo = document.getElementById("btn-change-do")
const btnRequest = document.getElementById("btn-request")
const btnRequestDo = document.getElementById("btn-request-do")
const btnConfirm = document.getElementById("btn-confirm")
const btnConfirmDo = document.getElementById("btn-confirm-do")

const auths = { password: "", keys: {} }
let confirm_new_valid = false
let confirm_old_valid = false
let account = undefined

const msg_request_nok = "Your account cannot be recovered because you never changed your owner key or your owner key has been changed more than 30 days ago.";
const msg_request_pending ="@hive.recovery has issued the recovery request. Confirm the recovery to finalize the process.";

// Generate all keys from username and password
function getKeys(username, password, roles = ['owner', 'active', 'posting', 'memo']) {
  const keys = {}
  roles.forEach((role) => {
    const private = dhive.PrivateKey.fromLogin(username, password, role).toString()

    keys[role] = {}
    keys[role]["private"] = private
    keys[role]["public"] = dhive.PrivateKey.from(private).createPublic().toString()
  })
  return keys
}

// Create a suggested password
function suggestPassword() {
  const array = new Uint32Array(10)
  window.crypto.getRandomValues(array)
  return 'P'+dhive.PrivateKey.fromSeed(array).toString()
}

function updatePayload()
{
  const account = $("#account").val();
  const secret = $("#request-secret").val();
  const pubkey = $("#request-pubkey").val();
  const payload = $("#recover-payload");

  const value = (account && secret && pubkey) ? JSON.stringify({account:account,secret:secret,pubkey:pubkey}) : "";
  payload.val(value);
  btnRequestDo.disabled = !value
}

function reset_forms() {
  btnChange.textContent = "Change Recovery Account"
  btnRequest.textContent = "Request Recovery"
  btnConfirm.textContent = "Confirm Recovery"

  $("#account-feedback").text("");

  uiChangeTitle.style.display = 'block'
  $("#change-password").val("");
  $("#change-email").val("");
  $("#change-secret").val("");
  $("#change-feedback").removeClass("alert-success alert-danger").empty();
  uiChangeSaved.checked = false;

  uiRequestTitle.style.display = 'block'
  $("#request-secret").val("");
  $("#request-pubkey").val("");
  $("#request-feedback").removeClass("alert-success alert-danger").empty();

  $("#confirm-new-pub").val("");
  $("#confirm-new-pass").val("");
  $("#confirm-old-priv").val("");
  $("#confirm-feedback").removeClass("alert-success alert-danger").empty();
}

function click_newKeys() {
  const account = $("#account").val();

  auths.password = suggestPassword()
  auths.keys = getKeys(account,auths.password)

  document.getElementById("modal-password").textContent = auths.password
  document.getElementById("opriv").textContent = auths.keys["owner"]["private"]
  document.getElementById("opub").textContent = auths.keys["owner"]["public"]
  document.getElementById("apriv").textContent = auths.keys["active"]["private"]
  document.getElementById("apub").textContent = auths.keys["active"]["public"]
  document.getElementById("ppriv").textContent = auths.keys["posting"]["private"]
  document.getElementById("ppub").textContent = auths.keys["posting"]["public"]
  document.getElementById("mpriv").textContent = auths.keys["memo"]["private"]
  document.getElementById("mpub").textContent = auths.keys["memo"]["public"]

  uiModalSaved.checked = false
  // uiModal.style.display = "block"
}

function click_payloadcopy() {
  const payload = document.getElementById("recover-payload");
  payload.select();
  payload.setSelectionRange(0, 99999); /* For mobile devices */
  /* Copy the text inside the text field */
  document.execCommand("copy");
  alert("Payload copied");
}

function click_continue() {
  $("#request-pubkey").val(auths.keys["owner"]["public"])
  updatePayload()
  // uiModal.style.display = "none";
  $('#modal').modal('hide')
}

function toggleModalSaved(element)
{
  document.getElementById("modal-continue").disabled = !element.checked
}

function toggleChangeSaved(element)
{
  btnChangeDo.disabled = !element.checked
}

function select_tab(id) {
  const tabcontent = document.getElementsByClassName("tab-content");
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = tabcontent[i].id==id ? "block" : "none"
  }
}

function button_set(button,_class) {
  button.classList.toggle("btn-secondary",_class=="btn-secondary")
  button.classList.toggle("btn-success",_class=="btn-success")
  button.classList.toggle("btn-warning",_class=="btn-warning")
  button.classList.toggle("btn-danger",_class=="btn-danger")
  button.disabled = _class=="btn-secondary"
}

async function click_accountcheck() {
  const username = $("#account").val();
  const [requestChange] = (await hiveClient.call('database_api','find_change_recovery_account_requests', {"accounts":[username]})).requests
  const requestRecovery = await hiveClient.database.call('get_recovery_request', [username])
  const now = new Date();
  const lastUpdate = new Date(`${account.last_owner_update}Z`)
  const recoverable = ((now.getTime() - lastUpdate.getTime()) < (30*24*60*60*1000))

  uiChangeSaved.checked = false

  $("#account-feedback").text(`Your Recovery Account is @${account.recovery_account}`);

  if(account.recovery_account!=RECOVERY_ACCOUNT) {
    if(requestChange && requestChange.recovery_account==RECOVERY_ACCOUNT) {
      const effective = new Date(requestChange.effective_on)
      const days = new Number((effective.getTime() / 86400000)-(now.getTime() / 86400000)).toFixed(0)
      const hours = new Number((effective.getTime() / 3600000)-(now.getTime() / 3600000)).toFixed(0)
      btnChange.textContent = `Change pending (${days > 0 ? (days + " day" + (days > 1 ? "s":"")) : ((hours+1) + " hour" + (hours > 1 ? "s":""))} left)`
      button_set(btnChange,"btn-warning")
      button_set(btnChangeDo,"btn-warning")
    } else{
      button_set(btnChange,"btn-danger")
      button_set(btnChangeDo,"btn-danger")
    }
    btnChangeDo.disabled = true
    uiChangeDone.style.display = 'none'
    uiChangeForm.style.display = 'block'
  } else {
    button_set(btnChange,"btn-success")
    button_set(btnChangeDo,"btn-danger")
    btnChange.textContent = `Recovery Account changed`
    uiChangeDone.style.display = 'block'
    uiChangeTitle.style.display = 'none'
    uiChangeForm.style.display = 'none'
  }

  if(account.recovery_account==RECOVERY_ACCOUNT) {
    const lastUpdate = new Date(account.last_owner_update)
    const days = new Number((now.getTime() / 86400000)-(lastUpdate.getTime() / 86400000))

    if(days > 30) {
      uiRequestDone.style.display = 'block'
      uiRequestDone.innerHTML = msg_request_nok
      uiRequestTitle.style.display = 'none'
      uiRequestForm.style.display = 'none'
      button_set(btnRequest,"btn-warning")
    } else {
      uiRequestDone.style.display = 'none'
      uiRequestForm.style.display = 'block'
      if(!requestRecovery) {
        button_set(btnRequest,"btn-danger")
      } else {
          uiRequestDone.style.display = 'block'
          uiRequestDone.innerHTML = msg_request_pending
          uiRequestTitle.style.display = 'none'
          uiRequestForm.style.display = 'none'
          btnRequest.textContent = `Recovery initiated`
          button_set(btnRequest,"btn-success")
      }
    }
  } else {
    button_set(btnRequest,"btn-secondary")
  }

  if(account.recovery_account==RECOVERY_ACCOUNT && requestRecovery) {
    if(recoverable) {
      button_set(btnConfirm,"btn-danger")
      const expires = new Date(requestRecovery.expires)
      const hours = new Number((expires.getTime() / 3600000)-(now.getTime() / 3600000))
      btnConfirm.textContent = `Confirm Recovery (${hours.toFixed(0) + " hour" + (hours > 1 ? "s":"")} left)`
    } else {
      button_set(btnConfirm,"btn-secondary")
      $("#account-feedback").addClass('alert-warning').text("Account owner key is older than 30 days");
    }
    $("#confirm-new-pub").val(requestRecovery.new_owner_authority.key_auths[0][0])
  } else {
    button_set(btnConfirm,"btn-secondary")
  }
}

function click_reveal(id) {
  document.getElementById(id).type="text"
}

$(document).ready(async function(event) {
  // Check if the account exists
  $("#account").keyup(async function(event) {
    const btn = document.getElementById("account-check");
    const username = $(this).val();

    [account] = (username ? await hiveClient.database.call("lookup_account_names", [[username]]) : []);
    (account) ? $(this).removeClass("is-invalid").addClass("is-valid") : $(this).removeClass("is-valid").addClass("is-invalid");
    (account) ? $("#account-check").removeClass("btn-secondary").addClass("btn-success") : $("#account-check").removeClass("btn-success").addClass("btn-secondary");
    btn.disabled = !account;
  
    if(event.keyCode === 13) {
      event.preventDefault()
      btn.click()
      updatePayload()
    } else {
      select_tab(null)
      button_set(btnChange,"btn-secondary")
      button_set(btnRequest,"btn-secondary")
      button_set(btnConfirm,"btn-secondary")
      reset_forms()
    }
  });

  // Processing change recovery form
  $("#change-form").submit(async function(e) {
    e.preventDefault();

    const account = $("#account").val();
    const password = $("#change-password").val();
    const email = $("#change-email").val();
    const secret = $("#change-secret").val();
    const feedback = $("#change-feedback");

    feedback.removeClass("alert-success alert-danger").empty();

    try {
      if(account === "") { 
        throw ("Invalid account");
      }
      if(password === "") { 
        throw ("Invalid password");
      }
      if(secret === "") { 
        throw ("Invalid secret");
      }

      const ownerKey = dhive.PrivateKey.fromLogin(account, password, 'owner').toString();
      const memoKey = dhive.PrivateKey.fromLogin(account, password, 'memo').toString();
      const accounts = await hiveClient.database.getAccounts([RECOVERY_ACCOUNT, account])

      if(!accounts[1]) {
        throw (`Unknown account ${account}`)
      }
      if(accounts[1].balance.startsWith("0.000")) {
        throw ("Insufficient HIVE balance - You need at least 0.001 HIVE")
      }

      const memoKeyRA = accounts[0].memo_key;
      const data = JSON.stringify({account:account,email:email});
      const memo = hive.memo.encode(memoKey, memoKeyRA, "#" + CryptoJS.AES.encrypt(data,secret).toString());

      const op1 =["transfer", {
        from: account,
        to: RECOVERY_ACCOUNT,
        amount: "0.001 HIVE",
        memo: memo
        }];
      const op2 =["change_recovery_account", {
        account_to_recover: account,
        new_recovery_account: RECOVERY_ACCOUNT,
        extensions: []
      }];

      hiveClient.broadcast.sendOperations([op1,op2], dhive.PrivateKey.from(ownerKey))
      .then(res => {
        console.log(res)
        feedback.addClass('alert-success').text("Your request to change your recovery account has been sent on the blockchain!");
        click_accountcheck()
      })
      .catch(err => {
        console.log(err)
        feedback.addClass('alert-danger').text(err.message);
      });
      
    } catch(e) {
      alert(e);
    }
  });

  // Processing recover account form
  $("#request-secret").keyup(async function() {
    updatePayload();
  });
  $("#request-pubkey").keyup(async function() {
    updatePayload();
  });

  $("#request-form").submit(async function(e) {
    e.preventDefault();

    const account = $("#account").val();
    const secret = $("#request-secret").val();
    const pubkey = $("#request-pubkey").val();
    const feedback = $("#request-feedback");

    const payload = JSON.stringify({account:account,secret:secret,pubkey:pubkey});
    const url = `mailto:${RECOVERY_EMAIL}?subject=Account Recovery Request - ${account}&body=${payload}`
    // open default email client
    window.location.href = url;
  });

  // Processing confirm form
  $("#confirm-new-pass").keyup(async function() {
    try {
      const pub = dhive.PrivateKey.from($(this).val()).createPublic().toString();
      (pub==$('#confirm-new-pub').val()) ? $(this).removeClass("is-invalid").addClass("is-valid") : $(this).removeClass("is-valid").addClass("is-invalid");
      confirm_new_valid = (pub==$('#confirm-new-pub').val())
    } catch(e) {
      $(this).removeClass("is-valid").addClass("is-invalid");
      confirm_new_valid = false
    }
    button_set(btnConfirmDo,confirm_new_valid && confirm_old_valid ? "btn-danger":"btn-secondary")
  });

  $("#confirm-old-priv").keyup(async function() {
    try {
      const pub = dhive.PrivateKey.from($(this).val()).createPublic().toString();
      $(this).removeClass("is-invalid").addClass("is-valid")
      confirm_old_valid = true
    } catch(e) {
      $(this).removeClass("is-valid").addClass("is-invalid")      
      confirm_old_valid = false
    }
    button_set(btnConfirmDo,confirm_new_valid && confirm_old_valid ? "btn-danger":"btn-secondary")
  });

  $("#confirm-form").submit(async function(e) {
    e.preventDefault();

    const username = $("#account").val();
    const oldPriv = $('#confirm-old-priv').val();
    const newPass = $('#confirm-new-pass').val();
    const feedback = $('#confirm-feedback');

    feedback.removeClass('alert-success alert-warning alert-danger').empty();

    const keys = getKeys(username, newPass);
    const request = await hiveClient.database.call('get_recovery_request', [username])
    if (request) {
      try {
        // confirm the account recovery
        const op1 = ['recover_account', {
          account_to_recover: username,
          new_owner_authority: {
            "weight_threshold": 1,
            "account_auths": [],
            "key_auths": [[dhive.PrivateKey.from(keys["ower"]["private"]).createPublic().toString(), 1]]
          },
          recent_owner_authority: {
            "weight_threshold": 1,
            "account_auths": [],
            "key_auths": [[dhive.PrivateKey.from(oldPriv).createPublic().toString(), 1]]
          },
          extensions: []
        }];
        const res1 = await hiveClient.broadcast.sendOperations([op1], [dhive.PrivateKey.from(oldPriv), dhive.PrivateKey.from(newPass)])
        console.log(res1);
        feedback.addClass('alert-success').html(`<strong@$>Your account has been recovered successfully.</strong@$>`);
  
        // Update account with the new keys
        const op2 = {
          account: username,
          owner: Authority.from({ weight_threshold: 1, account_auths: [], key_auths: [[keys["ower"]["public"], 1]] }),
          active: Authority.from({ weight_threshold: 1, account_auths: [], key_auths: [[keys["active"]["public"], 1]] }),
          posting: Authority.from({ weight_threshold: 1, account_auths: [], key_auths: [[keys["posting"]["public"], 1]] }),
          memo_key: keys["memo"]["public"],
          json_metadata: "",
        }
        const res2 = await hiveClient.broadcast.updateAccount(op2, PrivateKey.from(keys["ower"]["private"]))
        console.log(res2)
      } catch(e) {
        console.log(e);
        feedback.addClass('alert-danger').text(e.message);
      }
    } else {
      feedback.addClass('alert-warning').html(`Unable to find recovery request for <strong>${username}</strong> or the request has expired. Please start the procedure again.`);
    }
  });

  $('#modal').on('show.bs.modal', function (e) {
    click_newKeys()
  });  
});