// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @Libs
import * as React from 'react';
import { ReactElement, useState } from 'react';
import { NavLink, useHistory } from 'react-router-dom';
import { Button, Dropdown, Menu, message, Modal, MessageArgsProps, Tooltip } from 'antd';
// @Components
import {
  BreadcrumbsProps,
  withHome,
  Breadcrumbs
} from 'ui/components/Breadcrumbs/Breadcrumbs';
import { NotificationsWidget } from 'lib/components/NotificationsWidget/NotificationsWidget';
import { CurrentPlan } from 'ui/components/CurrentPlan/CurrentPlan';
import { handleError } from 'lib/components/components';
// @Icons
import Icon, {
  SettingOutlined,
  AreaChartOutlined,
  UnlockOutlined,
  ApiOutlined,
  NotificationOutlined,
  CloudOutlined,
  DownloadOutlined,
  UserOutlined,
  UserSwitchOutlined,
  LogoutOutlined,
  PartitionOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import logo from 'icons/logo.svg';
import logoMini from 'icons/logo-square.svg';
import { ReactComponent as DbtCloudIcon } from 'icons/dbtCloud.svg';
import { ReactComponent as KeyIcon } from 'icons/key.svg';
import classNames from 'classnames';
// @Model
import { Permission, User } from 'lib/services/model';
// @Utils
import { reloadPage } from 'lib/commons/utils';
import { Page, usePageLocation } from 'navigation';
// @Services
import { useServices } from 'hooks/useServices';
import { AnalyticsBlock } from 'lib/services/analytics';
import { PaymentPlanStatus } from 'lib/services/billing';
// @Styles
import styles from './Layout.module.less';
// @Misc
import { settingsPageRoutes } from './ui/pages/SettingsPage/SettingsPage';
import { FeatureSettings } from './lib/services/ApplicationServices';
import { usePersistentState } from './hooks/usePersistentState';
import githubLogo from './icons/github.svg';

type MenuItem = {
  icon: React.ReactNode
  title: React.ReactNode
  link: string,
  enabled: (f: FeatureSettings) => boolean
}

const makeItem = (icon: React.ReactNode, title: React.ReactNode, link: string, enabled = (f: FeatureSettings) => true): MenuItem => {
  return { icon, title, link, enabled };
}

const menuItems = [
  makeItem(<PartitionOutlined />, 'Home', '/connections'),
  makeItem(<ThunderboltOutlined />, 'Live Events', '/events_stream'),
  makeItem(<AreaChartOutlined />, 'Statistics', '/dashboard'),
  makeItem(<Icon component={KeyIcon} />, 'API Keys', '/api_keys'),
  makeItem(<ApiOutlined />, 'Sources', '/sources'),
  makeItem(<NotificationOutlined />, 'Destinations', '/destinations'),
  makeItem(<Icon component={DbtCloudIcon}/>, 'dbt Cloud Integration', '/dbtcloud'),
  makeItem(<CloudOutlined />, 'Custom Domains', '/domains', (f) => f.enableCustomDomains),
  makeItem(<DownloadOutlined />, 'Download Config', '/cfg_download', (f) => f.enableCustomDomains)
];

export const ApplicationMenu: React.FC<{expanded: boolean}> = ({ expanded }) => {
  const key = usePageLocation().mainMenuKey;

  return <div className="pt-3">
    {menuItems.map(item => {
      const selected = item.link === '/' + key;
      return <NavLink to={item.link} key={item.link}>
        <div key={item.link} className={`${selected && 'bg-bgPrimary'} whitespace-nowrap text-textPale hover:text-primaryHover py-3 ml-2 pl-4 pr-6 rounded-l-xl`}>
          {!expanded && <Tooltip title={item.title} placement="right" mouseEnterDelay={0}>
            {item.icon}
          </Tooltip>}

          {expanded && <>{item.icon}<span className="pl-2 whitespace-nowrap">{item.title}</span></>}
        </div>
      </NavLink>
    })}
  </div>
};

export const ApplicationSidebar: React.FC<{}> = () => {
  const [expanded, setExpanded] = usePersistentState(true, 'jitsu_menuExpanded');

  return <div className={`relative ${styles.sideBarContent}`} >
    <div>
      <div className={`${expanded ? 'w-3' : 'w-2'} absolute inline-block top-3 right-0 bg-bgTableHeader h-12 flex items-center justify-center rounded-l cursor-pointer`}
        onClick={() => setExpanded(!expanded)}>
        <svg xmlns="http://www.w3.org/2000/svg" className={`transform ${expanded ? 'rotate-90' : '-rotate-90'}`}  viewBox="0 0 24 24"><path d="M14.121,13.879c-0.586-0.586-6.414-6.414-7-7c-1.172-1.172-3.071-1.172-4.243,0	c-1.172,1.172-1.172,3.071,0,4.243c0.586,0.586,6.414,6.414,7,7c1.172,1.172,3.071,1.172,4.243,0	C15.293,16.95,15.293,15.05,14.121,13.879z" opacity=".35"/><path d="M14.121,18.121c0.586-0.586,6.414-6.414,7-7c1.172-1.172,1.172-3.071,0-4.243c-1.172-1.172-3.071-1.172-4.243,0	c-0.586,0.586-6.414,6.414-7,7c-1.172,1.172-1.172,3.071,0,4.243C11.05,19.293,12.95,19.293,14.121,18.121z"/></svg>
      </div>
      <a href="https://jitsu.com" className="text-center block pt-5 h-14">
        <img src={expanded ? logo : logoMini} alt="[logo]" className="h-8 mx-auto"/>
      </a>
      <ApplicationMenu expanded={expanded}/>
    </div>
  </div>
}

export type PageHeaderProps = {
  user: User
  plan: PaymentPlanStatus
}

function abbr(user: User) {
  return user.name?.split(' ').filter(part => part.length > 0).map(part => part[0]).join('').toUpperCase();
}

export const PageHeader: React.FC<PageHeaderProps> = ({ plan, user, children }) => {
  const [dropdownVisible, setDropdownVisible] = useState(false);
  return (
    <div className="border-b border-splitBorder mb-4 h-12 flex flex-nowrap">
      <div className="flex-grow">
        <div className="h-12 flex items-center">{children}</div>
      </div>
      <div
        className={
          `flex-shrink flex justify-center items-center mx-1`
        }
      >
        <NotificationsWidget />
      </div>
      <div className="flex-shrink flex justify-center items-center">
        <Dropdown
          trigger={['click']}
          onVisibleChange={(vis) => setDropdownVisible(vis)}
          visible={dropdownVisible}
          overlay={
            <DropdownMenu
              user={user}
              plan={plan}
              hideMenu={() => setDropdownVisible(false)}
            />
          }
        >
          <Button
            className="ml-1 border-primary border-2 hover:border-text text-text hover:text-text"
            size="large"
            shape="circle"
          >
            {abbr(user) || <UserOutlined />}
          </Button>
        </Dropdown>
      </div>
    </div>
  );
}

export const DropdownMenu: React.FC<{user: User, plan: PaymentPlanStatus, hideMenu: () => void}> = ({ plan, user , hideMenu }) => {
  const services = useServices();
  const history = useHistory();

  const showSettings = React.useCallback<() => void>(() => history.push(settingsPageRoutes[0]), [history])

  const becomeUser = async() => {
    let email = prompt('Please enter e-mail of the user', '');
    if (!email) {
      return;
    }
    try {
      AnalyticsBlock.blockAll();
      await services.userService.becomeUser(email);
    } catch (e) {
      handleError(e, "Can't login as other user");
      AnalyticsBlock.unblockAll();
    }
  };

  return (
    <div className="bg-bgSecondary">
      <div className="py-5 border-b border-main px-5 flex flex-col items-center">
        <div className="text-center text-text text-lg">{user.name}</div>
        <div className="text-secondaryText text-xs underline">{user.email}</div>
      </div>
      <div className="py-2 border-b border-main px-5 flex flex-col items-start">
        <div>Project: <b>{services.activeProject.name || 'Unspecified'}</b></div>
      </div>
      {services.features.billingEnabled &&<div className="py-5 border-b border-main px-5 flex flex-col items-start">
        <CurrentPlan
          limit={plan.currentPlan.events_limit}
          usage={plan.eventsThisMonth}
          planTitle={plan.currentPlan.name}
          onPlanChangeModalOpen={hideMenu}
          planId={plan.currentPlan.id}
        />
      </div>}
      <div className="p-2 flex flex-col items-stretch">
        <Button
          type="text"
          className="text-left"
          key="settings"
          icon={<SettingOutlined/>}
          onClick={showSettings}>
            Settings
        </Button>
        {services.userService.getUser().hasPermission(Permission.BECOME_OTHER_USER) &&
          <Button
            className="text-left"
            type="text"
            key="become"
            icon={<UserSwitchOutlined/>}
            onClick={becomeUser}>
              Become User
          </Button>
        }
        <Button
          className="text-left"
          type="text"
          key="logout"
          icon={<LogoutOutlined/>}
          onClick={() => services.userService.removeAuth(reloadPage)
          }>Logout</Button>
      </div>
    </div>
  );
}

export type ApplicationPageWrapperProps = {
  page: Page
  user: User
  plan: PaymentPlanStatus
  [propName: string]: any
}

export const ApplicationPage: React.FC<ApplicationPageWrapperProps> = ({ plan, page, user, ...rest }) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbsProps>(withHome({ elements: [{ title: page.pageHeader }] }));

  let Component = page.component as React.ExoticComponent;
  let props = { setBreadcrumbs }
  return <div className={styles.applicationPage}>
    <div className={classNames(styles.sidebar)}>
      <ApplicationSidebar />
    </div>
    <div className={classNames(styles.rightbar)}>
      <PageHeader user={user} plan={plan}><Breadcrumbs {...breadcrumbs} /></PageHeader>
      <div className={styles.applicationPageComponent}>
        <Component {...(props as any)} />
      </div>
    </div>
  </div>;
}

export const SlackChatWidget: React.FC<{}> = () => {
  const services = useServices();
  const [modalVisible, setModalVisible] = useState(false);
  return <><div id="jitsuSlackWidget"
    onClick={() => {
      services.analyticsService.track('slack_invitation_open');
      setModalVisible(true)
    }}
    className="fixed bottom-5 right-5 rounded-full bg-primary text-text w-12 h-12 flex justify-center items-center cursor-pointer hover:bg-primaryHover">
    <svg className="h-6 w-6" fill="currentColor"  viewBox="0 0 24 24">
      <path d="M 4 3 C 2.9 3 2 3.9 2 5 L 2 15.792969 C 2 16.237969 2.5385156 16.461484 2.8535156 16.146484 L 5 14 L 14 14 C 15.1 14 16 13.1 16 12 L 16 5 C 16 3.9 15.1 3 14 3 L 4 3 z M 18 8 L 18 12 C 18 14.209 16.209 16 14 16 L 8 16 L 8 17 C 8 18.1 8.9 19 10 19 L 19 19 L 21.146484 21.146484 C 21.461484 21.461484 22 21.237969 22 20.792969 L 22 10 C 22 8.9 21.1 8 20 8 L 18 8 z"/>
    </svg>
  </div>
  <SlackInvitationModal visible={modalVisible} hide={() => {
    setModalVisible(false);
  }}/></>
}

export const SlackInvitationModal: React.FC<{visible: boolean, hide: () => void}> = ({ visible , hide }) => {

  return <Modal
    title="Join Jitsu Slack"
    visible={visible}
    onCancel={() => {
      hide();
    }}
    footer={null}
  >
    <div className="text-lg">
      We'd be delighted to assist you with any issues in our <b>public Slack</b>! 100+ members
      already received help from our community
    </div>
    <div className="flex justify-center pt-6">
      <Button
        onClick={() => {
          window.open('https://jitsu.com/slack', '_blank')
          hide();
        }}

        size="large" type="primary" icon={<Icon component={() => <svg className="fill-current" viewBox="0 0 24 24" height="1em" width="1em">
          <path d="m8.843 12.651c-1.392 0-2.521 1.129-2.521 2.521v6.306c0 1.392 1.129 2.521 2.521 2.521s2.521-1.129 2.521-2.521v-6.306c-.001-1.392-1.13-2.521-2.521-2.521z"/>
          <path d="m.019 15.172c0 1.393 1.13 2.523 2.523 2.523s2.523-1.13 2.523-2.523v-2.523h-2.521c-.001 0-.001 0-.002 0-1.393 0-2.523 1.13-2.523 2.523z"/>
          <path d="m8.846-.001c-.001 0-.002 0-.003 0-1.393 0-2.523 1.13-2.523 2.523s1.13 2.523 2.523 2.523h2.521v-2.523c0-.001 0-.003 0-.005-.001-1.391-1.128-2.518-2.518-2.518z"/>
          <path d="m2.525 11.37h6.318c1.393 0 2.523-1.13 2.523-2.523s-1.13-2.523-2.523-2.523h-6.318c-1.393 0-2.523 1.13-2.523 2.523s1.13 2.523 2.523 2.523z"/>
          <path d="m21.457 6.323c-1.391 0-2.518 1.127-2.518 2.518v.005 2.523h2.521c1.393 0 2.523-1.13 2.523-2.523s-1.13-2.523-2.523-2.523c-.001 0-.002 0-.003 0z"/>
          <path d="m12.641 2.522v6.325c0 1.392 1.129 2.521 2.521 2.521s2.521-1.129 2.521-2.521v-6.325c0-1.392-1.129-2.521-2.521-2.521-1.392 0-2.521 1.129-2.521 2.521z"/>
          <g>
            <path d="m17.682 21.476c0-1.392-1.129-2.521-2.521-2.521h-2.521v2.523c.001 1.391 1.129 2.519 2.521 2.519s2.521-1.129 2.521-2.521z"/>
            <path d="m21.479 12.649h-6.318c-1.393 0-2.523 1.13-2.523 2.523s1.13 2.523 2.523 2.523h6.318c1.393 0 2.523-1.13 2.523-2.523s-1.13-2.523-2.523-2.523z"/>
          </g>
        </svg>} />}>Join Jitsu Slack</Button>
    </div>
  </Modal>
}

const EmailIsNotConfirmedMessage: React.FC<{ messageKey: React.Key }> = ({
  messageKey
}) => {
  const services = useServices();
  const [isSendingVerification, setIsSendingVerification] =
    useState<boolean>(false);

  const handleDestroyMessage = () => message.destroy(messageKey);
  const handleresendConfirmationLink = async() => {
    setIsSendingVerification(true);
    try {
      await services.userService.sendConfirmationEmail();
    } finally {
      setIsSendingVerification(false);
    }
    handleDestroyMessage();
  };
  return (
    <span className="flex flex-col items-center mt-1">
      <span>
        <span>{'Email '}</span>
        {services.userService.getUser()?.email ? (
          <span className={`font-semibold ${styles.emailHighlight}`}>
            {services.userService.getUser()?.email}
          </span>
        ) : (
          ''
        )}
        <span>
          {` is not verified. Please, follow the instructions in your email
            to complete the verification process.`}
        </span>
      </span>
      <span>
        <Button
          type="link"
          loading={isSendingVerification}
          onClick={handleresendConfirmationLink}
        >
          {'Resend verification link'}
        </Button>
        <Button type="text" onClick={handleDestroyMessage}>
          {'Close'}
        </Button>
      </span>
    </span>
  );
};

const MESSAGE_KEY = 'email-not-confirmed-message';

export const emailIsNotConfirmedMessageConfig: MessageArgsProps = {
  type: 'error',
  key: MESSAGE_KEY,
  duration: null,
  icon: <>{null}</>,
  content: <EmailIsNotConfirmedMessage messageKey={MESSAGE_KEY} />
};
